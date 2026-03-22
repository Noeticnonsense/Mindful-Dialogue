import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  Brain,
  Copy,
  Download,
  Loader2,
  Lock,
  MessageSquare,
  RefreshCw,
  Shield,
  Sparkles,
  Users,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

type ParsedMessage = {
  id: string;
  speaker: string;
  rawSpeaker: string;
  text: string;
  turn: number;
  timestamp: string | null;
};

type Party = {
  id: string;
  name: string;
  messageCount: number;
  dominantStates: string[];
  stateConfidence: number;
  notes: string;
};

type PatternEvidence = {
  speaker: string;
  turn: number;
  quote: string;
};

type DetectedPattern = {
  label: string;
  description: string;
  branch: string;
  evidence: PatternEvidence[];
  confidence: number;
  caution: string;
};

type EmotionalStep = {
  speaker: string;
  turn: number;
  state: string;
  confidence: number;
  rationale: string;
};

type ReplySuggestions = {
  gentle: string;
  assertive: string;
  boundaryFocused: string;
  deEscalating: string;
  pauseInstead: string;
};

type ReflectionMessage = {
  targetSpeaker: string;
  message: string;
};

type AnalysisResponse = {
  meta: {
    title: string;
    disclaimer: string;
    savedRawText: boolean;
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
  parties: Party[];
  conversationSummary: string;
  toneScores: {
    authentic: number;
    defensive: number;
    supportive: number;
    pressureSignals: number;
    inconsistencySignals: number;
  };
  patterns: DetectedPattern[];
  emotionalProgression: EmotionalStep[];
  replySuggestions: ReplySuggestions;
  reflectionMessages: ReflectionMessage[];
  safety: {
    confidenceNote: string;
    misusePrevention: string[];
  };
};

const SAMPLE = `Alex: I don't know why you're upset. You're always overreacting.
Jordan: I'm upset because you ignored me all weekend.
Alex: I was busy. Besides, if you trusted me, this wouldn't be a problem.
Jordan: I just wanted a quick reply.
Alex: Wow, so now I'm the bad guy? After everything I do for you.
Jordan: That's not what I said.
Alex: Fine. Do whatever you want.`;

const FALLBACK_DISCLAIMER =
  "This tool provides language-pattern analysis for reflection and communication support. It does not diagnose mental health conditions, determine intent, or confirm deception. Treat results as hypotheses, not facts.";

const DEFAULT_REPLIES: ReplySuggestions = {
  gentle: "I want to understand each other clearly. Can we stay with the original issue and talk about it directly?",
  assertive: "I’m willing to talk, but not in a way that dismisses my perspective or shifts the issue.",
  boundaryFocused:
    "When the conversation turns into blame or minimization, I’m going to pause and return to the specific point.",
  deEscalating: "This feels tense right now. Let’s slow down and come back to the specific issue.",
  pauseInstead: "This may be a good time to pause before responding.",
};

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function toPercent(value: unknown): number {
  return clampPercent(Math.round(clamp01(Number(value) || 0) * 100));
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function splitConversation(raw: string): Array<{ speaker: string; text: string; turn: number }> {
  const lines = raw
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const parsed: Array<{ speaker: string; text: string; turn: number }> = [];
  let fallbackSpeakerIndex = 0;

  for (const line of lines) {
    const match = line.match(/^([^:]{1,40}):\s*(.+)$/);
    if (match) {
      parsed.push({ speaker: match[1].trim(), text: match[2].trim(), turn: parsed.length + 1 });
    } else {
      const speaker = fallbackSpeakerIndex % 2 === 0 ? "Speaker A" : "Speaker B";
      parsed.push({ speaker, text: line, turn: parsed.length + 1 });
      fallbackSpeakerIndex += 1;
    }
  }

  return parsed;
}

function buildFallbackAnalysis(input: string, title: string): AnalysisResponse {
  const messages = splitConversation(input);
  const speakers = [...new Set(messages.map((message) => message.speaker))];
  const joined = normalize(input);

  const pressureSignals = clampPercent(
    8 +
      (joined.includes("you're overreacting") ? 22 : 0) +
      (joined.includes("after everything i do") ? 24 : 0) +
      (joined.includes("if you trusted me") ? 18 : 0) +
      (joined.includes("fine. do whatever") || joined.includes("fine do whatever") ? 16 : 0)
  );

  const defensive = clampPercent(
    10 +
      (joined.includes("i was busy") ? 20 : 0) +
      (/\b(always|never)\b/i.test(input) ? 14 : 0) +
      (joined.includes("besides") ? 12 : 0)
  );

  const authentic = clampPercent(
    12 + (joined.includes("i'm upset because") ? 20 : 0) + (joined.includes("i just wanted") ? 16 : 0)
  );

  return {
    meta: {
      title,
      disclaimer: FALLBACK_DISCLAIMER,
      savedRawText: false,
      redactionApplied: false,
      generatedAt: new Date().toISOString(),
    },
    input: {
      originalLength: input.length,
      normalizedLength: input.trim().length,
      detectedSpeakers: speakers,
      uncertainSpeakerAssignments: speakers.includes("Speaker A") || speakers.includes("Speaker B"),
    },
    parsedConversation: messages.map((message, index) => ({
      id: `m_${index + 1}`,
      speaker: message.speaker,
      rawSpeaker: message.speaker,
      text: message.text,
      turn: index + 1,
      timestamp: null,
    })),
    parties: speakers.map((speaker, index) => ({
      id: String.fromCharCode(65 + index),
      name: speaker,
      messageCount: messages.filter((message) => message.speaker === speaker).length,
      dominantStates: [speaker === speakers[0] ? "defensive" : "hurt"],
      stateConfidence: 0.42,
      notes: "Fallback local analysis used because the backend was unavailable.",
    })),
    conversationSummary:
      "Fallback local analysis suggests a tense exchange with defensiveness, hurt, and possible pressure language. Connect the backend route for stronger structured results.",
    toneScores: {
      authentic: authentic / 100,
      defensive: defensive / 100,
      supportive: 0.16,
      pressureSignals: pressureSignals / 100,
      inconsistencySignals: 0.12,
    },
    patterns: [
      ...(joined.includes("you're overreacting")
        ? [
            {
              label: "minimization",
              description: "Language that appears to downplay the other person’s emotional reality.",
              branch: "social psychology",
              evidence: [{ speaker: speakers[0] || "Speaker A", turn: 1, quote: "You're always overreacting." }],
              confidence: 0.72,
              caution: "This is a language-pattern inference, not proof of intent.",
            },
          ]
        : []),
      ...(joined.includes("after everything i do")
        ? [
            {
              label: "guilt pressure",
              description: "Language that may use guilt or indebtedness to influence the conversation.",
              branch: "social psychology",
              evidence: [{ speaker: speakers[0] || "Speaker A", turn: 5, quote: "After everything I do for you." }],
              confidence: 0.76,
              caution: "Context matters, and one phrase alone should not be overinterpreted.",
            },
          ]
        : []),
    ],
    emotionalProgression: messages.map((message) => ({
      speaker: message.speaker,
      turn: message.turn,
      state: /upset|ignored/i.test(message.text)
        ? "hurt"
        : /overreacting|bad guy|fine/i.test(message.text)
          ? "defensive"
          : "unclear",
      confidence: 0.45,
      rationale: "Fallback language-based estimate.",
    })),
    replySuggestions: { ...DEFAULT_REPLIES },
    reflectionMessages: speakers.map((speaker) => ({
      targetSpeaker: speaker,
      message:
        `Hey ${speaker}, I want to mention something gently. Parts of this conversation felt tense and hard to resolve. ` +
        `I may be reading it imperfectly, but some wording came across as dismissive or defensive. ` +
        `I’m not saying that to attack you — just to make clearer communication easier for both of us.`,
    })),
    safety: {
      confidenceNote:
        "Fallback local analysis is less reliable than the backend model pipeline and should be treated cautiously.",
      misusePrevention: [
        "Do not use this as proof that someone is lying or abusive.",
        "Review the actual quoted evidence before drawing conclusions.",
        "Edit any generated message before sending it.",
      ],
    },
  };
}

function sanitizeAnalysisResponse(data: unknown, inputText: string, title: string): AnalysisResponse {
  const fallback = buildFallbackAnalysis(inputText, title);

  if (!data || typeof data !== "object") {
    return fallback;
  }

  const maybe = data as Partial<AnalysisResponse>;

  return {
    meta: {
      title: typeof maybe.meta?.title === "string" ? maybe.meta.title : fallback.meta.title,
      disclaimer: typeof maybe.meta?.disclaimer === "string" ? maybe.meta.disclaimer : fallback.meta.disclaimer,
      savedRawText: Boolean(maybe.meta?.savedRawText),
      redactionApplied: Boolean(maybe.meta?.redactionApplied),
      generatedAt: typeof maybe.meta?.generatedAt === "string" ? maybe.meta.generatedAt : fallback.meta.generatedAt,
    },
    input: {
      originalLength: typeof maybe.input?.originalLength === "number" ? maybe.input.originalLength : fallback.input.originalLength,
      normalizedLength:
        typeof maybe.input?.normalizedLength === "number" ? maybe.input.normalizedLength : fallback.input.normalizedLength,
      detectedSpeakers: Array.isArray(maybe.input?.detectedSpeakers)
        ? maybe.input.detectedSpeakers.filter((value): value is string => typeof value === "string")
        : fallback.input.detectedSpeakers,
      uncertainSpeakerAssignments:
        typeof maybe.input?.uncertainSpeakerAssignments === "boolean"
          ? maybe.input.uncertainSpeakerAssignments
          : fallback.input.uncertainSpeakerAssignments,
    },
    parsedConversation: Array.isArray(maybe.parsedConversation)
      ? maybe.parsedConversation.map((item, index) => ({
          id: typeof item?.id === "string" ? item.id : `m_${index + 1}`,
          speaker: typeof item?.speaker === "string" ? item.speaker : "Unknown",
          rawSpeaker: typeof item?.rawSpeaker === "string" ? item.rawSpeaker : "Unknown",
          text: typeof item?.text === "string" ? item.text : "",
          turn: typeof item?.turn === "number" ? item.turn : index + 1,
          timestamp: typeof item?.timestamp === "string" || item?.timestamp === null ? item.timestamp : null,
        }))
      : fallback.parsedConversation,
    parties: Array.isArray(maybe.parties)
      ? maybe.parties.map((party, index) => ({
          id: typeof party?.id === "string" ? party.id : String.fromCharCode(65 + index),
          name: typeof party?.name === "string" ? party.name : `Speaker ${index + 1}`,
          messageCount: typeof party?.messageCount === "number" ? party.messageCount : 0,
          dominantStates: Array.isArray(party?.dominantStates)
            ? party.dominantStates.filter((value): value is string => typeof value === "string")
            : ["unclear"],
          stateConfidence: typeof party?.stateConfidence === "number" ? clamp01(party.stateConfidence) : 0,
          notes: typeof party?.notes === "string" ? party.notes : "",
        }))
      : fallback.parties,
    conversationSummary:
      typeof maybe.conversationSummary === "string" ? maybe.conversationSummary : fallback.conversationSummary,
    toneScores: {
      authentic: typeof maybe.toneScores?.authentic === "number" ? clamp01(maybe.toneScores.authentic) : fallback.toneScores.authentic,
      defensive: typeof maybe.toneScores?.defensive === "number" ? clamp01(maybe.toneScores.defensive) : fallback.toneScores.defensive,
      supportive: typeof maybe.toneScores?.supportive === "number" ? clamp01(maybe.toneScores.supportive) : fallback.toneScores.supportive,
      pressureSignals:
        typeof maybe.toneScores?.pressureSignals === "number"
          ? clamp01(maybe.toneScores.pressureSignals)
          : fallback.toneScores.pressureSignals,
      inconsistencySignals:
        typeof maybe.toneScores?.inconsistencySignals === "number"
          ? clamp01(maybe.toneScores.inconsistencySignals)
          : fallback.toneScores.inconsistencySignals,
    },
    patterns: Array.isArray(maybe.patterns)
      ? maybe.patterns.map((pattern) => ({
          label: typeof pattern?.label === "string" ? pattern.label : "unknown",
          description: typeof pattern?.description === "string" ? pattern.description : "",
          branch: typeof pattern?.branch === "string" ? pattern.branch : "conflict communication",
          evidence: Array.isArray(pattern?.evidence)
            ? pattern.evidence.map((item) => ({
                speaker: typeof item?.speaker === "string" ? item.speaker : "Unknown",
                turn: typeof item?.turn === "number" ? item.turn : 0,
                quote: typeof item?.quote === "string" ? item.quote : "",
              }))
            : [],
          confidence: typeof pattern?.confidence === "number" ? clamp01(pattern.confidence) : 0,
          caution:
            typeof pattern?.caution === "string" ? pattern.caution : "This pattern is inferential and may be ambiguous.",
        }))
      : fallback.patterns,
    emotionalProgression: Array.isArray(maybe.emotionalProgression)
      ? maybe.emotionalProgression.map((step, index) => ({
          speaker: typeof step?.speaker === "string" ? step.speaker : "Unknown",
          turn: typeof step?.turn === "number" ? step.turn : index + 1,
          state: typeof step?.state === "string" ? step.state : "unclear",
          confidence: typeof step?.confidence === "number" ? clamp01(step.confidence) : 0,
          rationale: typeof step?.rationale === "string" ? step.rationale : "",
        }))
      : fallback.emotionalProgression,
    replySuggestions: {
      gentle:
        typeof maybe.replySuggestions?.gentle === "string" ? maybe.replySuggestions.gentle : fallback.replySuggestions.gentle,
      assertive:
        typeof maybe.replySuggestions?.assertive === "string"
          ? maybe.replySuggestions.assertive
          : fallback.replySuggestions.assertive,
      boundaryFocused:
        typeof maybe.replySuggestions?.boundaryFocused === "string"
          ? maybe.replySuggestions.boundaryFocused
          : fallback.replySuggestions.boundaryFocused,
      deEscalating:
        typeof maybe.replySuggestions?.deEscalating === "string"
          ? maybe.replySuggestions.deEscalating
          : fallback.replySuggestions.deEscalating,
      pauseInstead:
        typeof maybe.replySuggestions?.pauseInstead === "string"
          ? maybe.replySuggestions.pauseInstead
          : fallback.replySuggestions.pauseInstead,
    },
    reflectionMessages: Array.isArray(maybe.reflectionMessages)
      ? maybe.reflectionMessages.map((item, index) => ({
          targetSpeaker: typeof item?.targetSpeaker === "string" ? item.targetSpeaker : `Speaker ${index + 1}`,
          message: typeof item?.message === "string" ? item.message : "",
        }))
      : fallback.reflectionMessages,
    safety: {
      confidenceNote:
        typeof maybe.safety?.confidenceNote === "string" ? maybe.safety.confidenceNote : fallback.safety.confidenceNote,
      misusePrevention: Array.isArray(maybe.safety?.misusePrevention)
        ? maybe.safety.misusePrevention.filter((value): value is string => typeof value === "string")
        : fallback.safety.misusePrevention,
    },
  };
}

async function parseErrorResponse(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") || "";

  try {
    if (contentType.includes("application/json")) {
      const data = await response.json();
      if (typeof data?.detail === "string") return data.detail;
      if (typeof data?.error === "string") return data.error;
    }

    const text = await response.text();
    if (text.trim()) return text.slice(0, 240);
  } catch {
    return `Request failed with status ${response.status}.`;
  }

  return `Request failed with status ${response.status}.`;
}

async function requestAnalysis(input: string, title: string): Promise<AnalysisResponse> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: input, title }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const message = await parseErrorResponse(response);
      throw new Error(message);
    }

    const data = await response.json();
    return sanitizeAnalysisResponse(data, input, title);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("The analysis request timed out after 20 seconds.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function exportReport(title: string, analysis: AnalysisResponse) {
  const payload = {
    title,
    generatedAt: new Date().toISOString(),
    analysis,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "conversation-analysis-report.json";
  a.click();
  URL.revokeObjectURL(url);
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Test failed: ${message}`);
  }
}

function runLocalTests() {
  const split = splitConversation("A: one\nB: two");
  assert(split.length === 2, "splitConversation parses two messages");
  assert(split[0].speaker === "A", "splitConversation keeps speaker label");

  const fallback = buildFallbackAnalysis(SAMPLE, "Test");
  assert(fallback.parties.length >= 2, "fallback analysis builds parties");
  assert(fallback.replySuggestions.gentle.length > 0, "fallback analysis has replies");

  const sanitized = sanitizeAnalysisResponse(
    {
      meta: { title: "Y", disclaimer: "d", savedRawText: false, redactionApplied: false, generatedAt: "now" },
      input: { originalLength: 1, normalizedLength: 1, detectedSpeakers: ["A"], uncertainSpeakerAssignments: false },
      parsedConversation: [],
      parties: [],
      conversationSummary: "ok",
      toneScores: { authentic: 2, defensive: -1, supportive: 0.5, pressureSignals: 0.2, inconsistencySignals: 0.1 },
      patterns: [],
      emotionalProgression: [],
      replySuggestions: { gentle: "g", assertive: "a", boundaryFocused: "b", deEscalating: "d", pauseInstead: "p" },
      reflectionMessages: [],
      safety: { confidenceNote: "safe", misusePrevention: ["x"] },
    },
    "X",
    "Y"
  );
  assert(sanitized.toneScores.authentic === 1, "sanitize clamps high values");
  assert(sanitized.toneScores.defensive === 0, "sanitize clamps low values");
  assert(sanitized.replySuggestions.gentle === "g", "sanitize preserves valid replies");
}

if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  runLocalTests();
}

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-700">{label}</span>
        <span className="font-medium text-slate-900">{value}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-slate-200">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={onCopy} className="gap-2 rounded-2xl">
      <Copy className="h-4 w-4" />
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

export default function PsychologyConversationApp() {
  const [input, setInput] = useState(SAMPLE);
  const [title, setTitle] = useState("Conversation Analysis");
  const [consent, setConsent] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResponse>(() => buildFallbackAnalysis(SAMPLE, "Conversation Analysis"));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastMode, setLastMode] = useState("Local fallback");

  const speakers = useMemo(() => analysis.parties.map((party) => party.name), [analysis]);

  async function runAnalysis() {
    if (!input.trim()) {
      setError("Paste a conversation or text first.");
      return;
    }

    if (!consent) {
      setError("Please confirm the consent and privacy notice before analyzing.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await requestAnalysis(input, title);
      setAnalysis(result);
      setLastMode("Backend structured analysis");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Backend unavailable.";
      setAnalysis(buildFallbackAnalysis(input, title));
      setLastMode("Local fallback");
      setError(`Backend unavailable (${message}), so the app used the built-in fallback analyzer instead.`);
    } finally {
      setLoading(false);
    }
  }

  function handleLoadSample() {
    setInput(SAMPLE);
    setError("");
    setAnalysis(buildFallbackAnalysis(SAMPLE, title));
    setLastMode("Local fallback");
  }

  function handleClear() {
    setInput("");
    setError("");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50 p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <Card className="rounded-3xl border-0 shadow-xl shadow-slate-200/60">
          <CardHeader className="space-y-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <Badge className="rounded-full bg-indigo-100 text-indigo-700 hover:bg-indigo-100">Shareable prototype</Badge>
                  <Badge variant="outline" className="rounded-full">Educational use</Badge>
                  <Badge variant="outline" className="rounded-full">{lastMode}</Badge>
                </div>
                <CardTitle className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
                  Psychology Conversation Analyzer
                </CardTitle>
                <CardDescription className="mt-2 max-w-3xl text-base leading-7 text-slate-600">
                  Paste a conversation, separate speakers, screen for communication patterns, spot emotional shifts, and generate grounded reply suggestions.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="rounded-2xl" onClick={handleLoadSample}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Load sample
                </Button>
                <Button variant="outline" className="rounded-2xl" onClick={handleClear}>
                  Clear
                </Button>
                <Button className="rounded-2xl bg-slate-900 text-white hover:bg-slate-800" onClick={() => exportReport(title, analysis)}>
                  <Download className="mr-2 h-4 w-4" />
                  Export JSON
                </Button>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-[1fr_220px]">
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Analysis title"
                className="h-12 rounded-2xl border-slate-200"
              />
              <div className="flex items-center rounded-2xl border border-amber-200 bg-amber-50 px-4 text-sm text-amber-800">
                <AlertTriangle className="mr-2 h-4 w-4" />
                Not a diagnosis or lie detector
              </div>
            </div>
          </CardHeader>
        </Card>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <Card className="rounded-3xl border-0 shadow-lg shadow-slate-200/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <MessageSquare className="h-5 w-5" /> Input
              </CardTitle>
              <CardDescription>
                Best results when each line begins with a speaker label, like <span className="font-medium">Alex:</span> message.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Paste a conversation, journal entry, or any text here..."
                className="min-h-[360px] rounded-2xl border-slate-200 text-sm leading-6"
              />

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex items-start gap-3">
                  <Lock className="mt-0.5 h-4 w-4 text-slate-500" />
                  <div className="space-y-2 text-sm text-slate-600">
                    <p>{analysis.meta.disclaimer || FALLBACK_DISCLAIMER}</p>
                    <p>Only paste conversations you have the right to use, and avoid sharing highly sensitive personal information unless necessary.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Checkbox id="consent" checked={consent} onCheckedChange={(value) => setConsent(value === true)} />
                  <label htmlFor="consent" className="text-sm leading-6 text-slate-700">
                    I understand this is an educational reflection tool, not clinical, legal, or forensic advice, and I want to analyze this text.
                  </label>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={runAnalysis} disabled={loading} className="rounded-2xl bg-indigo-600 hover:bg-indigo-700">
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Brain className="mr-2 h-4 w-4" />}
                  {loading ? "Analyzing..." : "Analyze conversation"}
                </Button>
                {error ? <div className="text-sm text-amber-700">{error}</div> : null}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="rounded-3xl border-0 shadow-lg shadow-slate-200/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Brain className="h-5 w-5" /> Overall screen
                </CardTitle>
                <CardDescription>{analysis.conversationSummary}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ScoreBar label="Pressure signals" value={toPercent(analysis.toneScores.pressureSignals)} color="bg-rose-500" />
                <ScoreBar label="Inconsistency signals" value={toPercent(analysis.toneScores.inconsistencySignals)} color="bg-orange-500" />
                <ScoreBar label="Authentic language" value={toPercent(analysis.toneScores.authentic)} color="bg-emerald-500" />
                <ScoreBar label="Defensive tone" value={toPercent(analysis.toneScores.defensive)} color="bg-violet-500" />
                <ScoreBar label="Supportive tone" value={toPercent(analysis.toneScores.supportive)} color="bg-sky-500" />
                <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
                  <div className="mb-2 font-medium text-slate-900">Safety note</div>
                  <p>{analysis.safety.confidenceNote}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-3xl border-0 shadow-lg shadow-slate-200/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Users className="h-5 w-5" /> Separated parties
                </CardTitle>
                <CardDescription>
                  {analysis.input.uncertainSpeakerAssignments
                    ? "Some speaker assignments are uncertain. Add speaker labels for stronger results."
                    : `Detected ${speakers.length} party${speakers.length === 1 ? "" : "ies"}.`}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {analysis.parties.map((speaker) => (
                  <div key={speaker.name} className="rounded-2xl border border-slate-200 p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-900">{speaker.name}</div>
                        <div className="text-sm text-slate-500">
                          {speaker.messageCount} message(s) • state confidence {toPercent(speaker.stateConfidence)}%
                        </div>
                      </div>
                      <Badge className="rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100">speaker</Badge>
                    </div>
                    <div className="mb-3 flex flex-wrap gap-2">
                      {speaker.dominantStates.map((state) => (
                        <Badge key={`${speaker.name}-${state}`} variant="outline" className="rounded-full">
                          {state}
                        </Badge>
                      ))}
                    </div>
                    <p className="text-sm leading-6 text-slate-600">{speaker.notes}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="h-full rounded-3xl border-0 shadow-lg shadow-slate-200/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Shield className="h-5 w-5" /> Patterns detected
              </CardTitle>
              <CardDescription>Evidence-based pattern detection with confidence and caution.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {analysis.patterns.length ? (
                analysis.patterns.map((pattern, index) => (
                  <div key={`${pattern.label}-${index}`} className="rounded-2xl border border-slate-200 p-4">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <div className="font-medium text-slate-900">{pattern.label}</div>
                      <Badge className="rounded-full bg-indigo-100 text-indigo-700 hover:bg-indigo-100">{pattern.branch}</Badge>
                    </div>
                    <p className="text-sm leading-6 text-slate-600">{pattern.description}</p>
                    <div className="mt-3 text-xs text-slate-500">Confidence: {toPercent(pattern.confidence)}%</div>
                    {pattern.evidence.length ? (
                      <div className="mt-3 space-y-2">
                        {pattern.evidence.map((evidence, evidenceIndex) => (
                          <div key={evidenceIndex} className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                            <span className="font-medium">{evidence.speaker}, turn {evidence.turn}:</span> “{evidence.quote}”
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <div className="mt-3 text-xs leading-5 text-slate-500">{pattern.caution}</div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">No clear named pattern was returned for this excerpt.</div>
              )}
            </CardContent>
          </Card>

          <Card className="h-full rounded-3xl border-0 shadow-lg shadow-slate-200/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Sparkles className="h-5 w-5" /> Suggested replies
              </CardTitle>
              <CardDescription>De-escalating, boundary-aware options.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.entries(analysis.replySuggestions).map(([key, value]) => (
                <div key={key} className="rounded-2xl border border-slate-200 p-4">
                  <div className="mb-2 text-sm font-medium capitalize text-slate-900">{key.replace(/([A-Z])/g, " $1")}</div>
                  <p className="text-sm leading-6 text-slate-600">{value}</p>
                  <div className="mt-3">
                    <CopyButton text={String(value)} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="h-full rounded-3xl border-0 shadow-lg shadow-slate-200/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <MessageSquare className="h-5 w-5" /> Reflective messages
              </CardTitle>
              <CardDescription>A gentle message that names the possible pattern without escalating.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {analysis.reflectionMessages.map((item) => (
                <div key={item.targetSpeaker} className="rounded-2xl border border-slate-200 p-4">
                  <div className="mb-2 font-medium text-slate-900">For {item.targetSpeaker}</div>
                  <p className="text-sm leading-6 text-slate-600">{item.message}</p>
                  <div className="mt-3">
                    <CopyButton text={item.message} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="rounded-3xl border-0 shadow-lg shadow-slate-200/50">
            <CardHeader>
              <CardTitle className="text-xl">Emotional progression</CardTitle>
              <CardDescription>Turn-by-turn emotional interpretation from the returned analysis.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {analysis.emotionalProgression.length ? (
                analysis.emotionalProgression.map((step, index) => (
                  <div key={`${step.speaker}-${step.turn}-${index}`} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium text-slate-900">{step.speaker} • turn {step.turn}</div>
                      <Badge variant="outline" className="rounded-full">{step.state}</Badge>
                    </div>
                    <div className="mt-2 text-sm text-slate-500">Confidence {toPercent(step.confidence)}%</div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{step.rationale}</p>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">No emotional progression returned yet.</div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-0 bg-slate-900 text-white shadow-xl shadow-slate-300/40">
            <CardContent className="grid gap-6 p-6 md:p-8">
              <div>
                <div className="mb-2 text-sm font-medium text-slate-300">How this version works</div>
                <p className="text-sm leading-6 text-slate-200">
                  The frontend posts to <span className="font-medium">/api/analyze</span> with exactly two fields: <span className="font-medium">text</span> and <span className="font-medium">title</span>. The backend returns the exact shape this UI expects, and the UI sanitizes that payload before rendering it.
                </p>
              </div>
              <div>
                <div className="mb-2 text-sm font-medium text-slate-300">Why this lines up 1:1</div>
                <p className="text-sm leading-6 text-slate-200">
                  The frontend type matches the backend response keys: meta, input, parsedConversation, parties, conversationSummary, toneScores, patterns, emotionalProgression, replySuggestions, reflectionMessages, and safety.
                </p>
              </div>
              <div>
                <div className="mb-2 text-sm font-medium text-slate-300">Best next upgrade</div>
                <p className="text-sm leading-6 text-slate-200">
                  Add a speaker-review step so users can fix who said what before analysis. That is where a lot of trust lives.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
