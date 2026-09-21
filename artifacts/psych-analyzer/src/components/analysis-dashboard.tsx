import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Variants } from "framer-motion";
import { 
  AlertTriangle, 
  Brain, 
  Activity, 
  MessageSquareQuote, 
  ShieldAlert, 
  Copy, 
  CheckCircle2,
  ListFilter,
  User,
  Fingerprint
} from "lucide-react";
import type { AnalysisResponse } from "@workspace/api-client-react";
import { ChatTranscript } from "./chat-transcript";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface Props {
  data: AnalysisResponse;
}

const ScoreBar = ({ label, score, colorClass }: { label: string, score: number, colorClass: string }) => (
  <div className="mb-4 last:mb-0">
    <div className="flex justify-between text-sm mb-1.5">
      <span className="font-medium text-foreground">{label}</span>
      <span className="text-muted-foreground font-mono">{score}%</span>
    </div>
    <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
      <motion.div 
        initial={{ width: 0 }}
        animate={{ width: `${score}%` }}
        transition={{ duration: 1, ease: "easeOut" }}
        className={cn("h-full rounded-full", colorClass)}
      />
    </div>
  </div>
);

export function AnalysisDashboard({ data }: Props) {
  const { toast } = useToast();
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    toast({ title: "Copied to clipboard", description: "You can now paste this suggestion." });
    setTimeout(() => setCopiedText(null), 2000);
  };

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
  };

  return (
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="max-w-6xl mx-auto space-y-8 pb-20"
    >
      {/* Disclaimer Banner */}
      <motion.div variants={itemVariants} className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-4 items-start shadow-sm">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-sm text-amber-900 leading-relaxed">
          <strong>AI Analysis Note:</strong> {data.meta.disclaimer}
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* LEFT COLUMN: Transcript & Overview */}
        <div className="lg:col-span-5 space-y-8">
          
          <motion.section variants={itemVariants}>
            <div className="flex items-center gap-2 mb-4">
              <Brain className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-display font-semibold text-foreground">Summary</h2>
            </div>
            <div className="bg-card border shadow-sm rounded-2xl p-6 text-foreground/90 leading-relaxed">
              {data.conversationSummary}
            </div>
          </motion.section>

          <motion.section variants={itemVariants}>
            <div className="flex items-center gap-2 mb-4">
              <MessageSquareQuote className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-display font-semibold text-foreground">Original Transcript</h2>
            </div>
            <ChatTranscript messages={data.parsedConversation} />
          </motion.section>

          <motion.section variants={itemVariants}>
            <div className="flex items-center gap-2 mb-4">
              <ShieldAlert className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-display font-semibold text-foreground">Safety & Intent</h2>
            </div>
            <div className="bg-card border border-destructive/20 shadow-sm rounded-2xl p-6">
              <p className="text-sm text-muted-foreground mb-4 italic">
                {data.safety.confidenceNote}
              </p>
              <ul className="space-y-3">
                {data.safety.misusePrevention.map((rule, idx) => (
                  <li key={idx} className="flex gap-3 text-sm text-foreground/80 items-start">
                    <div className="w-1.5 h-1.5 rounded-full bg-destructive/60 mt-1.5 shrink-0" />
                    <span>{rule}</span>
                  </li>
                ))}
              </ul>
            </div>
          </motion.section>
        </div>

        {/* RIGHT COLUMN: Deep Analysis */}
        <div className="lg:col-span-7 space-y-8">
          
          {/* Tone & Speakers Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <motion.section variants={itemVariants} className="bg-card border shadow-sm rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-6">
                <Activity className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-display font-semibold">Overall Tone</h3>
              </div>
              <ScoreBar label="Authenticity" score={data.toneScores.authentic} colorClass="bg-teal-500" />
              <ScoreBar label="Supportiveness" score={data.toneScores.supportive} colorClass="bg-indigo-500" />
              <ScoreBar label="Defensiveness" score={data.toneScores.defensive} colorClass="bg-amber-500" />
              <ScoreBar label="Pressure Signals" score={data.toneScores.pressureSignals} colorClass="bg-rose-500" />
              <ScoreBar label="Inconsistency" score={data.toneScores.inconsistencySignals} colorClass="bg-purple-500" />
            </motion.section>

            <motion.section variants={itemVariants} className="bg-card border shadow-sm rounded-2xl p-6 flex flex-col gap-6">
              <div className="flex items-center gap-2 mb-2">
                <User className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-display font-semibold">Speaker Profiles</h3>
              </div>
              {data.parties.map(party => (
                <div key={party.id} className="border-l-2 border-primary pl-4 py-1">
                  <div className="font-semibold text-foreground">{party.name}</div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {party.dominantStates.map(state => (
                      <span key={state} className="px-2 py-0.5 bg-secondary text-secondary-foreground text-xs rounded-md font-medium">
                        {state}
                      </span>
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground mt-2 line-clamp-2" title={party.notes}>
                    {party.notes}
                  </p>
                </div>
              ))}
            </motion.section>
          </div>

          {/* Patterns */}
          <motion.section variants={itemVariants}>
            <div className="flex items-center gap-2 mb-4">
              <Fingerprint className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-display font-semibold text-foreground">Detected Patterns</h2>
            </div>
            <div className="space-y-4">
              {data.patterns.map((pattern, i) => (
                <div key={i} className="bg-card border shadow-sm hover:shadow-md transition-all rounded-2xl p-6 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 px-3 py-1 bg-primary/10 text-primary text-xs font-semibold rounded-bl-xl">
                    {pattern.branch}
                  </div>
                  <h4 className="text-lg font-bold text-foreground mb-2 pr-20">{pattern.label}</h4>
                  <p className="text-sm text-foreground/80 mb-4">{pattern.description}</p>
                  
                  <div className="space-y-3 mb-4">
                    {pattern.evidence.map((ev, evIdx) => (
                      <div key={evIdx} className="bg-secondary/50 rounded-xl p-3 border border-border/50">
                        <span className="text-xs font-bold text-muted-foreground block mb-1">
                          {ev.speaker} (Turn {ev.turn})
                        </span>
                        <blockquote className="text-sm text-foreground italic border-l-2 border-primary/40 pl-3">
                          "{ev.quote}"
                        </blockquote>
                      </div>
                    ))}
                  </div>
                  
                  {pattern.caution && (
                    <div className="text-xs text-amber-600/80 font-medium bg-amber-50/50 p-2 rounded-lg border border-amber-100">
                      Note: {pattern.caution}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </motion.section>

          {/* Reply Suggestions */}
          <motion.section variants={itemVariants}>
            <div className="flex items-center gap-2 mb-4">
              <ListFilter className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-display font-semibold text-foreground">How to Reply</h2>
              <span className="text-xs text-muted-foreground ml-auto">Choose a path forward</span>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {Object.entries(data.replySuggestions).map(([key, text]) => {
                // Capitalize and format key
                const formattedKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                
                return (
                  <div key={key} className="group relative bg-card border shadow-sm rounded-2xl p-5 hover:border-primary/40 transition-colors">
                    <h5 className="font-semibold text-primary mb-2 text-sm">{formattedKey}</h5>
                    <p className="text-sm text-foreground/90 leading-relaxed pb-6">{text}</p>
                    
                    <button 
                      onClick={() => handleCopy(text)}
                      className="absolute bottom-3 right-3 p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                      title="Copy suggestion"
                    >
                      {copiedText === text ? <CheckCircle2 className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                );
              })}
            </div>
          </motion.section>

          {/* Reflection Messages */}
          <motion.section variants={itemVariants}>
            <div className="bg-gradient-to-br from-indigo-50 to-teal-50 dark:from-indigo-950/20 dark:to-teal-950/20 border border-primary/20 shadow-sm rounded-3xl p-6 sm:p-8">
              <h2 className="text-xl font-display font-semibold text-foreground mb-6 text-center">Personal Reflections</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {data.reflectionMessages.map((ref, idx) => (
                  <div key={idx} className="bg-white/60 dark:bg-black/20 backdrop-blur-sm rounded-2xl p-5 border border-white/20 dark:border-white/5">
                    <div className="font-semibold text-foreground mb-2">For {ref.targetSpeaker}</div>
                    <p className="text-sm text-foreground/80 leading-relaxed italic">
                      "{ref.message}"
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </motion.section>

        </div>
      </div>
    </motion.div>
  );
}
