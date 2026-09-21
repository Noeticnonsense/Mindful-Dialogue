import { Router, type IRouter } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { AnalyzeConversationBody } from "@workspace/api-zod";

const router: IRouter = Router();

const DISCLAIMER =
  "This tool provides language-pattern analysis for reflection and communication support. It does not diagnose mental health conditions, determine intent, or confirm deception. Treat results as hypotheses, not facts.";

const SYSTEM_PROMPT = `You are a careful communication-analysis engine.

Your job is to analyze conversation text for educational reflection.

Rules:
1. Do not diagnose mental illness or personality disorders.
2. Do not claim certainty about intent, abuse, manipulation, or deception.
3. Do not call someone a liar.
4. Use cautious phrasing such as 'possible', 'appears', 'may indicate', and 'language-based signal'.
5. Always tie conclusions to quoted evidence from the text.
6. If evidence is weak or ambiguous, say so.
7. Separate speaker parsing from psychological interpretation.
8. Focus on communication patterns, emotional states, and relational stance.
9. Allowed psychology branches: social psychology, cognitive psychology, relationship psychology, clinical concepts (with caution), conflict communication.
10. Return strict JSON only.
11. Never include markdown.

Allowed pattern labels:
- deflection
- minimization
- guilt pressure
- shutdown / stonewalling
- blame shifting
- validation / repair attempt
- ambiguity / inconsistency signal
- defensiveness
- boundary setting
- reassurance

Tone scores are 0 to 1.
Confidence scores are 0 to 1.`;

type ParsedMessage = {
  id: string;
  speaker: string;
  rawSpeaker: string;
  text: string;
  turn: number;
  timestamp: string | null;
};

function normalizeInput(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function redactSensitiveData(text: string): { text: string; redactionApplied: boolean } {
  let redacted = text;
  let changed = false;

  const rules: Array<[RegExp, string]> = [
    [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[EMAIL]"],
    [/\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, "[PHONE]"],
    [/\b\d{3}-\d{2}-\d{4}\b/g, "[SSN]"],
    [/\b\d{1,5}\s+[A-Za-z0-9.'-]+\s+(Street|St|Avenue|Ave|Road|Rd|Lane|Ln|Drive|Dr|Boulevard|Blvd)\b/gi, "[ADDRESS]"],
  ];

  for (const [pattern, replacement] of rules) {
    if (pattern.test(redacted)) {
      changed = true;
      redacted = redacted.replace(pattern, replacement);
    }
  }

  return { text: redacted, redactionApplied: changed };
}

function canonicalizeSpeakerName(name: string): string {
  return name
    .trim()
    .replace(/^me$/i, "Me")
    .replace(/^you$/i, "You")
    .replace(/\s+/g, " ");
}

function normalizePartyNames(input: unknown): [string, string] | undefined {
  if (!Array.isArray(input)) return undefined;
  const names = input.map((name) => String(name).trim()).filter(Boolean);
  return names.length >= 2 ? [names[0], names[1]] : undefined;
}

function resolveSpeakerLabel(label: string, partyNames?: [string, string]): string {
  const canonicalLabel = canonicalizeSpeakerName(label);
  if (!partyNames) return canonicalLabel;

  const genericLabels = new Map([
    ["speaker a", partyNames[0]],
    ["speaker 1", partyNames[0]],
    ["person 1", partyNames[0]],
    ["party 1", partyNames[0]],
    ["me", partyNames[0]],
    ["speaker b", partyNames[1]],
    ["speaker 2", partyNames[1]],
    ["person 2", partyNames[1]],
    ["party 2", partyNames[1]],
    ["you", partyNames[1]],
  ]);

  return genericLabels.get(canonicalLabel.toLowerCase()) || canonicalLabel;
}

function mergeWrappedLines(messages: ParsedMessage[]): ParsedMessage[] {
  if (!messages.length) return [];
  const merged: ParsedMessage[] = [];

  for (const msg of messages) {
    const last = merged[merged.length - 1];
    if (
      last &&
      last.speaker === msg.speaker &&
      msg.timestamp == null &&
      msg.text.length < 120 &&
      !/[.!?]$/.test(last.text)
    ) {
      last.text = `${last.text} ${msg.text}`.trim();
      continue;
    }
    merged.push({ ...msg });
  }

  return merged.map((m, index) => ({ ...m, turn: index + 1, id: `m_${index + 1}` }));
}

function parseConversation(text: string, partyNames?: [string, string]): ParsedMessage[] {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const messages: ParsedMessage[] = [];
  let turn = 1;
  let fallbackIndex = 0;

  for (const line of lines) {
    const timestampMatch = line.match(/^\[?(\d{1,2}:\d{2}(?::\d{2})?\s?(?:AM|PM|am|pm)?)\]?\s+/);
    const timestamp = timestampMatch ? timestampMatch[1] : null;
    const cleanedLine = timestampMatch ? line.replace(timestampMatch[0], "") : line;

    const speakerMatch = cleanedLine.match(/^([^:]{1,50}):\s*(.+)$/);
    if (speakerMatch) {
      const rawSpeaker = speakerMatch[1].trim();
      messages.push({
        id: `m_${turn}`,
        speaker: resolveSpeakerLabel(rawSpeaker, partyNames),
        rawSpeaker,
        text: speakerMatch[2].trim(),
        turn,
        timestamp,
      });
      turn += 1;
      continue;
    }

    const fallbackNames = partyNames || ["Speaker A", "Speaker B"];
    const speaker = fallbackNames[fallbackIndex % 2];
    messages.push({
      id: `m_${turn}`,
      speaker,
      rawSpeaker: speaker,
      text: cleanedLine,
      turn,
      timestamp,
    });
    fallbackIndex += 1;
    turn += 1;
  }

  return mergeWrappedLines(messages);
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function normalizeParties(input: unknown, parsedConversation: ParsedMessage[]) {
  const defaultCounts = parsedConversation.reduce<Record<string, number>>((acc, msg) => {
    acc[msg.speaker] = (acc[msg.speaker] || 0) + 1;
    return acc;
  }, {});

  const speakers = Object.keys(defaultCounts);
  const modelParties = Array.isArray(input) ? input : [];

  return speakers.map((name, index) => {
    const party = (modelParties[index] || {}) as Record<string, unknown>;
    return {
      id: String(party?.id || String.fromCharCode(65 + index)),
      name,
      messageCount: defaultCounts[name],
      dominantStates: Array.isArray(party?.dominantStates) ? party.dominantStates.map(String) : ["unclear"],
      stateConfidence: clamp01(Number(party?.stateConfidence || 0)),
      notes: String(party?.notes || "No model-enriched speaker profile available."),
    };
  });
}

function normalizeToneScores(input: Record<string, unknown>) {
  return {
    authentic: clamp01(Number(input?.authentic || 0)),
    defensive: clamp01(Number(input?.defensive || 0)),
    supportive: clamp01(Number(input?.supportive || 0)),
    pressureSignals: clamp01(Number(input?.pressureSignals || 0)),
    inconsistencySignals: clamp01(Number(input?.inconsistencySignals || 0)),
  };
}

function normalizePatterns(input: unknown) {
  if (!Array.isArray(input)) return [];
  return input.map((pattern: Record<string, unknown>) => ({
    label: String(pattern?.label || "unknown"),
    description: String(pattern?.description || ""),
    branch: String(pattern?.branch || "conflict communication"),
    evidence: Array.isArray(pattern?.evidence)
      ? pattern.evidence.map((e: Record<string, unknown>) => ({
          speaker: String(e?.speaker || "Unknown"),
          turn: Number(e?.turn || 0),
          quote: String(e?.quote || ""),
        }))
      : [],
    confidence: clamp01(Number(pattern?.confidence || 0)),
    caution: String(pattern?.caution || "This pattern is inferential and may be ambiguous."),
  }));
}

function normalizeEmotionalProgression(input: unknown, parsedConversation: ParsedMessage[]) {
  if (!Array.isArray(input) || !input.length) {
    return parsedConversation.map((msg) => ({
      speaker: msg.speaker,
      turn: msg.turn,
      state: "unclear",
      confidence: 0,
      rationale: "No model-enriched emotional progression available.",
    }));
  }

  return input.map((item: Record<string, unknown>) => ({
    speaker: String(item?.speaker || "Unknown"),
    turn: Number(item?.turn || 0),
    state: String(item?.state || "unclear"),
    confidence: clamp01(Number(item?.confidence || 0)),
    rationale: String(item?.rationale || ""),
  }));
}

function normalizeReplySuggestions(input: Record<string, unknown>) {
  return {
    gentle: String(input?.gentle || "I want to respond carefully, so I'm taking a moment before replying."),
    assertive: String(input?.assertive || "I want to keep this focused on the original issue."),
    boundaryFocused: String(
      input?.boundaryFocused || "I'm open to talking, but not in a way that dismisses my experience."
    ),
    deEscalating: String(
      input?.deEscalating || "This feels tense. Let's slow down and come back to the specific point."
    ),
    pauseInstead: String(input?.pauseInstead || "A pause may be healthier than replying immediately."),
  };
}

function normalizeReflectionMessages(input: unknown, speakers: string[]) {
  if (!Array.isArray(input) || !input.length) {
    return speakers.map((speaker) => ({
      targetSpeaker: speaker,
      message:
        `I want to mention something gently. Parts of our conversation felt tense and hard to resolve. ` +
        `I may be reading it imperfectly, but some wording seemed dismissive or defensive. ` +
        `I'm not saying that to attack you — only to make it easier for us to communicate more clearly.`,
    }));
  }

  return input.map((item: Record<string, unknown>) => ({
    targetSpeaker: String(item?.targetSpeaker || "Unknown"),
    message: String(item?.message || ""),
  }));
}

function safeJsonParse(value: string): Record<string, unknown> {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

router.post("/analyze", async (req, res) => {
  try {
    const parsed = AnalyzeConversationBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request", detail: parsed.error.message });
      return;
    }

    const { text, title = "Conversation Analysis", partyNames } = parsed.data;
    const normalized = normalizeInput(text);
    const redacted = redactSensitiveData(normalized);
    const normalizedPartyNames = normalizePartyNames(partyNames);
    const parsedConversation = parseConversation(redacted.text, normalizedPartyNames);
    const detectedSpeakers = [...new Set(parsedConversation.map((m) => m.speaker))];

    const prompt = `${SYSTEM_PROMPT}

Analyze the following conversation.

${normalizedPartyNames ? `The user provided these participant names: ${JSON.stringify(normalizedPartyNames)}. Use these exact names in every speaker reference. Do not invent placeholder names or rename either participant.` : ""}

Parsed conversation:
${JSON.stringify(parsedConversation, null, 2)}

Raw normalized text:
${redacted.text}

Return JSON with this exact top-level shape:
{
  "parties": [{"id": "A", "name": "Alex", "messageCount": 3, "dominantStates": ["defensive", "frustrated"], "stateConfidence": 0.72, "notes": "Brief, cautious summary."}],
  "conversationSummary": "...",
  "toneScores": {"authentic": 0.4, "defensive": 0.7, "supportive": 0.2, "pressureSignals": 0.6, "inconsistencySignals": 0.3},
  "patterns": [{"label": "minimization", "description": "...", "branch": "social psychology", "evidence": [{"speaker": "Alex", "turn": 1, "quote": "exact quote"}], "confidence": 0.7, "caution": "..."}],
  "emotionalProgression": [{"speaker": "Alex", "turn": 1, "state": "defensive", "confidence": 0.6, "rationale": "..."}],
  "replySuggestions": {"gentle": "...", "assertive": "...", "boundaryFocused": "...", "deEscalating": "...", "pauseInstead": "..."},
  "reflectionMessages": [{"targetSpeaker": "Alex", "message": "..."}],
  "safety": {"confidenceNote": "..."}
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const rawContent = response.choices[0]?.message?.content || "{}";
    const modelResult = safeJsonParse(rawContent);

    const result = {
      meta: {
        title,
        disclaimer: DISCLAIMER,
        savedRawText: false,
        redactionApplied: redacted.redactionApplied,
        generatedAt: new Date().toISOString(),
      },
      input: {
        originalLength: text.length,
        normalizedLength: normalized.length,
        detectedSpeakers,
        uncertainSpeakerAssignments: detectedSpeakers.includes("Speaker A") || detectedSpeakers.includes("Speaker B"),
      },
      parsedConversation,
      parties: normalizeParties(modelResult?.parties, parsedConversation),
      conversationSummary:
        typeof modelResult?.conversationSummary === "string"
          ? modelResult.conversationSummary
          : "This conversation contains emotionally meaningful interaction, but the summary could not be generated reliably.",
      toneScores: normalizeToneScores((modelResult?.toneScores as Record<string, unknown>) || {}),
      patterns: normalizePatterns(modelResult?.patterns),
      emotionalProgression: normalizeEmotionalProgression(modelResult?.emotionalProgression, parsedConversation),
      replySuggestions: normalizeReplySuggestions((modelResult?.replySuggestions as Record<string, unknown>) || {}),
      reflectionMessages: normalizeReflectionMessages(modelResult?.reflectionMessages, detectedSpeakers),
      safety: {
        confidenceNote:
          typeof modelResult?.safety === "object" &&
          modelResult?.safety !== null &&
          typeof (modelResult.safety as Record<string, unknown>).confidenceNote === "string"
            ? (modelResult.safety as Record<string, unknown>).confidenceNote as string
            : "Outputs reflect language-pattern inference, not verified facts about intent, character, or diagnosis.",
        misusePrevention: [
          "Do not use this output as proof that someone is lying or abusive.",
          "Do not use this tool for emergency, legal, or forensic decisions.",
          "Review quoted evidence and edit any generated message before sending it.",
        ],
      },
    };

    res.json(result);
  } catch (error) {
    req.log.error({ err: error }, "analyze route error");
    res.status(500).json({
      error: "Analysis failed",
      detail: error instanceof Error ? error.message : "The server could not complete the analysis safely.",
    });
  }
});

export default router;
