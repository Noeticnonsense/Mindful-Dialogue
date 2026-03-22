import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";

type ParsedMessage = {
  id: string;
  speaker: string;
  rawSpeaker: string;
  text: string;
  turn: number;
  timestamp?: string | null;
};

type DetectedPattern = {
  label: string;
  description: string;
  branch: string;
  evidence: Array<{
    speaker: string;
    turn: number;
    quote: string;
  }>;
  confidence: number;
  caution: string;
};

type SpeakerProfile = {
  id: string;
  name: string;
  messageCount: number;
  dominantStates: string[];
  stateConfidence: number;
  notes: string;
};

type EmotionalProgression = {
  speaker: string;
  turn: number;
  state: string;
  confidence: number;
  rationale: string;
};

type AnalysisResponse = {
  meta: {
    title: string;
    disclaimer: string;
    savedRawText: false;
    redactionApplied: boolean;
    generatedAt: string;
  };
  input: {
    originalLength: number;
    normalizedLength: number;
    detectedSpeakers: string[];
    uncertainSpeakerAssignments: boolean;
  };
  parsedConversation: ParsedMessage[];
  parties: SpeakerProfile[];
  conversationSummary: string;
  toneScores: {
    authentic: number;
    defensive: number;
    supportive: number;
    pressureSignals: number;
    inconsistencySignals: number;
  };
  patterns: DetectedPattern[];
  emotionalProgression: EmotionalProgression[];
  replySuggestions: {
    gentle: string;
    assertive: string;
    boundaryFocused: string;
    deEscalating: string;
    pauseInstead: string;
  };
  reflectionMessages: Array<{
    targetSpeaker: string;
    message: string;
  }>;
  safety: {
    confidenceNote: string;
    misusePrevention: string[];
  };
};

type IncomingBody = {
  text: string;
  title?: string;
  saveReport?: boolean;
};

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

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        {
          error: "Missing OPENAI_API_KEY",
          detail: "Add OPENAI_API_KEY to .env.local and restart the server.",
        },
        { status: 500 }
      );
    }

    const body = (await req.json()) as IncomingBody;
    const text = String(body?.text || "").trim();
    const title = String(body?.title || "Conversation Analysis").trim();

    if (!text) {
      return NextResponse.json({ error: "Missing text" }, { status: 400 });
    }

    const normalized = normalizeInput(text);
    const redacted = redactSensitiveData(normalized);
    const parsedConversation = parseConversation(redacted.text);

    const analysis = await analyzeConversationWithModel({
      title,
      originalTextLength: text.length,
      normalizedText: redacted.text,
      parsedConversation,
      redactionApplied: redacted.redactionApplied,
    });

    return NextResponse.json(analysis, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("/api/analyze error", sanitizeError(error));
    return NextResponse.json(
      {
        error: "Analysis failed",
        detail: error instanceof Error ? error.message : "The server could not complete the analysis safely.",
      },
      { status: 500 }
    );
  }
}

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

function parseConversation(text: string): ParsedMessage[] {
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
      messages.push({
        id: `m_${turn}`,
        speaker: canonicalizeSpeakerName(speakerMatch[1]),
        rawSpeaker: speakerMatch[1].trim(),
        text: speakerMatch[2].trim(),
        turn,
        timestamp,
      });
      turn += 1;
      continue;
    }

    const speaker = fallbackIndex % 2 === 0 ? "Speaker A" : "Speaker B";
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

function canonicalizeSpeakerName(name: string): string {
  return name
    .trim()
    .replace(/^me$/i, "Me")
    .replace(/^you$/i, "You")
    .replace(/\s+/g, " ");
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

async function analyzeConversationWithModel(params: {
  title: string;
  originalTextLength: number;
  normalizedText: string;
  parsedConversation: ParsedMessage[];
  redactionApplied: boolean;
}): Promise<AnalysisResponse> {
  const { title, originalTextLength, normalizedText, parsedConversation, redactionApplied } = params;

  const prompt = buildAnalysisPrompt({
    normalizedText,
    parsedConversation,
  });

  const modelResult = await callModel(prompt);
  const parsed = safeJsonParse(modelResult);

  const detectedSpeakers = [...new Set(parsedConversation.map((m) => m.speaker))];

  return {
    meta: {
      title,
      disclaimer: DISCLAIMER,
      savedRawText: false,
      redactionApplied,
      generatedAt: new Date().toISOString(),
    },
    input: {
      originalLength: originalTextLength,
      normalizedLength: normalizedText.length,
      detectedSpeakers,
      uncertainSpeakerAssignments: detectedSpeakers.includes("Speaker A") || detectedSpeakers.includes("Speaker B"),
    },
    parsedConversation,
    parties: normalizeParties(parsed?.parties, parsedConversation),
    conversationSummary:
      parsed?.conversationSummary ||
      "This conversation appears to contain emotionally meaningful interaction, but the summary could not be generated reliably.",
    toneScores: normalizeToneScores(parsed?.toneScores),
    patterns: normalizePatterns(parsed?.patterns),
    emotionalProgression: normalizeEmotionalProgression(parsed?.emotionalProgression, parsedConversation),
    replySuggestions: normalizeReplySuggestions(parsed?.replySuggestions),
    reflectionMessages: normalizeReflectionMessages(parsed?.reflectionMessages, detectedSpeakers),
    safety: {
      confidenceNote:
        parsed?.safety?.confidenceNote ||
        "Outputs reflect language-pattern inference, not verified facts about intent, character, or diagnosis.",
      misusePrevention: [
        "Do not use this output as proof that someone is lying or abusive.",
        "Do not use this tool for emergency, legal, or forensic decisions.",
        "Review quoted evidence and edit any generated message before sending it.",
      ],
    },
  };
}

function buildAnalysisPrompt(params: { normalizedText: string; parsedConversation: ParsedMessage[] }): string {
  const { normalizedText, parsedConversation } = params;

  return `${SYSTEM_PROMPT}\n\nAnalyze the following conversation.\n\nParsed conversation:\n${JSON.stringify(
    parsedConversation,
    null,
    2
  )}\n\nRaw normalized text:\n${normalizedText}\n\nReturn JSON with this exact top-level shape:\n{\n  "parties": [{\n    "id": "A",\n    "name": "Alex",\n    "messageCount": 3,\n    "dominantStates": ["defensive", "frustrated"],\n    "stateConfidence": 0.72,\n    "notes": "Brief, cautious summary."\n  }],\n  "conversationSummary": "...",\n  "toneScores": {\n    "authentic": 0.4,\n    "defensive": 0.7,\n    "supportive": 0.2,\n    "pressureSignals": 0.6,\n    "inconsistencySignals": 0.3\n  },\n  "patterns": [{\n    "label": "deflection",\n    "description": "...",\n    "branch": "social psychology",\n    "evidence": [{ "speaker": "Alex", "turn": 2, "quote": "..." }],\n    "confidence": 0.78,\n    "caution": "Explain ambiguity or limits."\n  }],\n  "emotionalProgression": [{\n    "speaker": "Jordan",\n    "turn": 1,\n    "state": "hurt",\n    "confidence": 0.81,\n    "rationale": "..."\n  }],\n  "replySuggestions": {\n    "gentle": "...",\n    "assertive": "...",\n    "boundaryFocused": "...",\n    "deEscalating": "...",\n    "pauseInstead": "..."\n  },\n  "reflectionMessages": [{\n    "targetSpeaker": "Alex",\n    "message": "..."\n  }],\n  "safety": {\n    "confidenceNote": "..."\n  }\n}\n\nRequirements:\n- Keep reflection messages non-accusatory and editable.\n- Prefer 'possible pressure signal' over 'manipulative'.\n- Only mention a pattern if there is direct evidence.\n- If no evidence, leave arrays empty rather than inventing.`;
}

async function callModel(prompt: string): Promise<string> {
  const response = await client.responses.create({
    model: "gpt-5.4",
    store: false,
    input: prompt,
    text: {
      format: {
        type: "json_schema",
        name: "conversation_analysis",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            parties: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  id: { type: "string" },
                  name: { type: "string" },
                  messageCount: { type: "number" },
                  dominantStates: {
                    type: "array",
                    items: { type: "string" },
                  },
                  stateConfidence: { type: "number" },
                  notes: { type: "string" },
                },
                required: ["id", "name", "messageCount", "dominantStates", "stateConfidence", "notes"],
              },
            },
            conversationSummary: { type: "string" },
            toneScores: {
              type: "object",
              additionalProperties: false,
              properties: {
                authentic: { type: "number" },
                defensive: { type: "number" },
                supportive: { type: "number" },
                pressureSignals: { type: "number" },
                inconsistencySignals: { type: "number" },
              },
              required: ["authentic", "defensive", "supportive", "pressureSignals", "inconsistencySignals"],
            },
            patterns: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  label: { type: "string" },
                  description: { type: "string" },
                  branch: { type: "string" },
                  evidence: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        speaker: { type: "string" },
                        turn: { type: "number" },
                        quote: { type: "string" },
                      },
                      required: ["speaker", "turn", "quote"],
                    },
                  },
                  confidence: { type: "number" },
                  caution: { type: "string" },
                },
                required: ["label", "description", "branch", "evidence", "confidence", "caution"],
              },
            },
            emotionalProgression: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  speaker: { type: "string" },
                  turn: { type: "number" },
                  state: { type: "string" },
                  confidence: { type: "number" },
                  rationale: { type: "string" },
                },
                required: ["speaker", "turn", "state", "confidence", "rationale"],
              },
            },
            replySuggestions: {
              type: "object",
              additionalProperties: false,
              properties: {
                gentle: { type: "string" },
                assertive: { type: "string" },
                boundaryFocused: { type: "string" },
                deEscalating: { type: "string" },
                pauseInstead: { type: "string" },
              },
              required: ["gentle", "assertive", "boundaryFocused", "deEscalating", "pauseInstead"],
            },
            reflectionMessages: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  targetSpeaker: { type: "string" },
                  message: { type: "string" },
                },
                required: ["targetSpeaker", "message"],
              },
            },
            safety: {
              type: "object",
              additionalProperties: false,
              properties: {
                confidenceNote: { type: "string" },
              },
              required: ["confidenceNote"],
            },
          },
          required: [
            "parties",
            "conversationSummary",
            "toneScores",
            "patterns",
            "emotionalProgression",
            "replySuggestions",
            "reflectionMessages",
            "safety",
          ],
        },
      },
    },
  });

  return response.output_text;
}

function safeJsonParse(value: string): any {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function normalizeParties(input: any, parsedConversation: ParsedMessage[]): SpeakerProfile[] {
  const defaultCounts = parsedConversation.reduce<Record<string, number>>((acc, msg) => {
    acc[msg.speaker] = (acc[msg.speaker] || 0) + 1;
    return acc;
  }, {});

  if (!Array.isArray(input) || !input.length) {
    return Object.entries(defaultCounts).map(([name, count], index) => ({
      id: String.fromCharCode(65 + index),
      name,
      messageCount: count,
      dominantStates: ["unclear"],
      stateConfidence: 0,
      notes: "No model-enriched speaker profile available yet.",
    }));
  }

  return input.map((party: any, index: number) => ({
    id: String(party?.id || String.fromCharCode(65 + index)),
    name: String(party?.name || `Speaker ${index + 1}`),
    messageCount: Number(party?.messageCount || defaultCounts[party?.name] || 0),
    dominantStates: Array.isArray(party?.dominantStates) ? party.dominantStates.map(String) : ["unclear"],
    stateConfidence: clamp01(Number(party?.stateConfidence || 0)),
    notes: String(party?.notes || ""),
  }));
}

function normalizeToneScores(input: any) {
  return {
    authentic: clamp01(Number(input?.authentic || 0)),
    defensive: clamp01(Number(input?.defensive || 0)),
    supportive: clamp01(Number(input?.supportive || 0)),
    pressureSignals: clamp01(Number(input?.pressureSignals || 0)),
    inconsistencySignals: clamp01(Number(input?.inconsistencySignals || 0)),
  };
}

function normalizePatterns(input: any): DetectedPattern[] {
  if (!Array.isArray(input)) return [];
  return input.map((pattern: any) => ({
    label: String(pattern?.label || "unknown"),
    description: String(pattern?.description || ""),
    branch: String(pattern?.branch || "conflict communication"),
    evidence: Array.isArray(pattern?.evidence)
      ? pattern.evidence.map((e: any) => ({
          speaker: String(e?.speaker || "Unknown"),
          turn: Number(e?.turn || 0),
          quote: String(e?.quote || ""),
        }))
      : [],
    confidence: clamp01(Number(pattern?.confidence || 0)),
    caution: String(pattern?.caution || "This pattern is inferential and may be ambiguous."),
  }));
}

function normalizeEmotionalProgression(input: any, parsedConversation: ParsedMessage[]): EmotionalProgression[] {
  if (!Array.isArray(input) || !input.length) {
    return parsedConversation.map((msg) => ({
      speaker: msg.speaker,
      turn: msg.turn,
      state: "unclear",
      confidence: 0,
      rationale: "No model-enriched emotional progression available yet.",
    }));
  }

  return input.map((item: any) => ({
    speaker: String(item?.speaker || "Unknown"),
    turn: Number(item?.turn || 0),
    state: String(item?.state || "unclear"),
    confidence: clamp01(Number(item?.confidence || 0)),
    rationale: String(item?.rationale || ""),
  }));
}

function normalizeReplySuggestions(input: any) {
  return {
    gentle: String(input?.gentle || "I want to respond carefully, so I’m taking a moment before replying."),
    assertive: String(input?.assertive || "I want to keep this focused on the original issue and speak directly."),
    boundaryFocused: String(
      input?.boundaryFocused ||
        "I’m open to talking, but not in a way that dismisses my experience or shifts the issue."
    ),
    deEscalating: String(
      input?.deEscalating ||
        "This feels tense right now. Let’s slow down and come back to the specific point."
    ),
    pauseInstead: String(input?.pauseInstead || "A pause may be healthier than replying immediately."),
  };
}

function normalizeReflectionMessages(input: any, speakers: string[]) {
  if (!Array.isArray(input) || !input.length) {
    return speakers.map((speaker) => ({
      targetSpeaker: speaker,
      message:
        `I want to mention something gently. Parts of our conversation felt tense and hard to resolve. ` +
        `I may be reading it imperfectly, but some wording seemed dismissive or defensive. ` +
        `I’m not saying that to attack you — only to make it easier for us to communicate more clearly.`,
    }));
  }

  return input.map((item: any) => ({
    targetSpeaker: String(item?.targetSpeaker || "Unknown"),
    message: String(item?.message || ""),
  }));
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function sanitizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }
  return { message: "Unknown error" };
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Test failed: ${message}`);
  }
}

function runLocalTests(): void {
  const normalized = normalizeInput("A\t\tB\r\n\r\n\r\nC");
  assert(normalized === "A B\n\nC", "normalizeInput should normalize whitespace and line breaks");

  const redacted = redactSensitiveData("Email me at a@test.com or call 312-555-1212");
  assert(redacted.redactionApplied === true, "redactSensitiveData should flag changed text");
  assert(redacted.text.includes("[EMAIL]"), "redactSensitiveData should replace emails");
  assert(redacted.text.includes("[PHONE]"), "redactSensitiveData should replace phone numbers");

  const parsed = parseConversation("Alex: Hi\nJordan: Hello");
  assert(parsed.length === 2, "parseConversation should return two messages");
  assert(parsed[0].speaker === "Alex", "parseConversation should preserve speaker labels");

  const merged = mergeWrappedLines([
    { id: "m_1", speaker: "Alex", rawSpeaker: "Alex", text: "I wanted", turn: 1, timestamp: null },
    { id: "m_2", speaker: "Alex", rawSpeaker: "Alex", text: "to follow up", turn: 2, timestamp: null },
  ]);
  assert(merged.length === 1, "mergeWrappedLines should combine wrapped same-speaker lines");

  const tones = normalizeToneScores({ authentic: 2, defensive: -1, supportive: 0.5, pressureSignals: 0.4, inconsistencySignals: 0.1 });
  assert(tones.authentic === 1, "normalizeToneScores should clamp upper bound");
  assert(tones.defensive === 0, "normalizeToneScores should clamp lower bound");
}

if (process.env.NODE_ENV !== "production") {
  runLocalTests();
}

/*
Setup:
1. npm install openai
2. Add OPENAI_API_KEY=your_key to .env.local
3. Save this file as app/api/analyze/route.ts
4. Restart your dev server

This implementation uses the Responses API and Structured Outputs so the model returns a JSON schema-shaped object instead of freeform text. OpenAI recommends the Responses API for new projects, and Structured Outputs ensures the response matches your schema. ([developers.openai.com](https://developers.openai.com/api/docs/guides/migrate-to-responses/?utm_source=chatgpt.com))
*/
