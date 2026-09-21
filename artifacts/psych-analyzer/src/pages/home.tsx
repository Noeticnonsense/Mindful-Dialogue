import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, FileText, ArrowRight, Loader2 } from "lucide-react";
import { useAnalyzeConversation } from "@workspace/api-client-react";
import { AnalysisDashboard } from "@/components/analysis-dashboard";
import { SAMPLE_CONVERSATION } from "@/lib/mock-data";
import { useToast } from "@/hooks/use-toast";

const LOADING_MESSAGES = [
  "Parsing linguistic markers...",
  "Evaluating emotional tone...",
  "Detecting behavioral patterns...",
  "Structuring psychological insights...",
  "Preparing response suggestions..."
];

export default function Home() {
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [partyNames, setPartyNames] = useState(["", ""]);
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const { toast } = useToast();

  const { mutate: analyze, isPending, data: analysisData, reset } = useAnalyzeConversation({
    mutation: {
      onError: (err) => {
        console.error("Analysis failed:", err);
        toast({
          title: "Analysis failed",
          description: "The conversation could not be analyzed. Please try again.",
          variant: "destructive",
        });
      }
    }
  });

  // Cycle loading messages
  useEffect(() => {
    if (!isPending) return;
    const interval = setInterval(() => {
      setLoadingMsgIdx(prev => (prev + 1) % LOADING_MESSAGES.length);
    }, 1800);
    return () => clearInterval(interval);
  }, [isPending]);

  const handleAnalyze = () => {
    if (text.trim().length < 20) {
      toast({ title: "Input too short", description: "Please provide a longer conversation for meaningful analysis.", variant: "destructive" });
      return;
    }
    const names = partyNames.map(name => name.trim());
    if (names.some(name => !name)) {
      toast({ title: "Add both participant names", description: "Enter a name for each person before analyzing the conversation.", variant: "destructive" });
      return;
    }
    analyze({ data: { text, title: title || undefined, partyNames: names } });
  };

  const handleLoadSample = () => {
    setText(SAMPLE_CONVERSATION);
    setTitle("Sample: Argument over bills");
    setPartyNames(["Alex", "Jordan"]);
  };

  const activeData = analysisData;

  return (
    <div className="min-h-screen relative selection:bg-primary/20">
      {/* Background Image / Mesh */}
      <div 
        className="fixed inset-0 z-0 pointer-events-none opacity-40 dark:opacity-20"
        style={{
          backgroundImage: `url(${import.meta.env.BASE_URL}images/abstract-clinical-bg.png)`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed'
        }}
      />

      <div className="relative z-10">
        {/* Header */}
        <header className="border-b bg-background/80 backdrop-blur-md sticky top-0 z-50">
          <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => reset()}>
              <div className="bg-primary text-primary-foreground p-1.5 rounded-lg shadow-sm">
                <Sparkles className="w-5 h-5" />
              </div>
              <h1 className="font-display font-bold text-xl tracking-tight text-foreground">PsychAnalyzer</h1>
            </div>
            
            {activeData && (
              <button 
                onClick={() => reset()}
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                New Analysis
              </button>
            )}
          </div>
        </header>

        <main className="max-w-6xl mx-auto px-4 py-12">
          <AnimatePresence mode="wait">
            {!activeData && !isPending ? (
              <motion.div 
                key="input-view"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3 }}
                className="max-w-3xl mx-auto mt-8"
              >
                <div className="text-center mb-10">
                  <h2 className="text-4xl md:text-5xl font-display font-bold text-foreground mb-4 tracking-tight">
                    Understand the subtext.
                  </h2>
                  <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                    Paste a conversation and let our clinical AI models reveal the emotional patterns, hidden pressures, and healthier ways to respond.
                  </p>
                </div>

                <div className="bg-card border shadow-xl shadow-black/5 rounded-3xl p-6 md:p-8">
                  <div className="mb-6">
                    <label className="block text-sm font-semibold text-foreground mb-2">
                      Conversation Title (Optional)
                    </label>
                    <input 
                      type="text"
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      placeholder="e.g. Chat with my partner..."
                      className="w-full px-4 py-3 rounded-xl bg-background border-2 border-border focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-foreground"
                    />
                  </div>

                  <div className="mb-6">
                    <div className="mb-2">
                      <label className="block text-sm font-semibold text-foreground">
                        Who is in this conversation?
                      </label>
                      <p className="text-xs text-muted-foreground mt-1">
                        Enter both names so unlabeled lines and analysis results use the right people.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {partyNames.map((name, index) => (
                        <input
                          key={index}
                          type="text"
                          value={name}
                          onChange={e => setPartyNames(current => current.map((currentName, currentIndex) => currentIndex === index ? e.target.value : currentName))}
                          placeholder={index === 0 ? "e.g. Alex" : "e.g. Jordan"}
                          aria-label={`Participant ${index + 1} name`}
                          className="w-full px-4 py-3 rounded-xl bg-background border-2 border-border focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none text-foreground"
                        />
                      ))}
                    </div>
                  </div>

                  <div className="mb-6">
                    <div className="flex justify-between items-end mb-2">
                      <label className="block text-sm font-semibold text-foreground">
                        Transcript
                      </label>
                      <button 
                        onClick={handleLoadSample}
                        className="text-xs flex items-center gap-1 text-primary hover:text-primary/80 font-medium transition-colors"
                      >
                        <FileText className="w-3 h-3" />
                        Load Sample
                      </button>
                    </div>
                    <textarea 
                      value={text}
                      onChange={e => setText(e.target.value)}
                      placeholder="Alex: I can't believe you did that.&#10;Jordan: I didn't mean to!"
                      className="w-full h-64 px-4 py-3 rounded-xl bg-background border-2 border-border focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all outline-none resize-none text-foreground leading-relaxed custom-scrollbar"
                    />
                    <p className="text-xs text-muted-foreground mt-2">
                      Format as "Name: Message" on each line for best results.
                    </p>
                  </div>

                  <button 
                    onClick={handleAnalyze}
                    disabled={!text.trim()}
                    className="w-full py-4 rounded-xl font-semibold text-lg bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:pointer-events-none transition-all flex items-center justify-center gap-2 group"
                  >
                    Analyze Interaction
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              </motion.div>
            ) : isPending ? (
              <motion.div 
                key="loading-view"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center py-32"
              >
                <div className="relative">
                  <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full animate-pulse" />
                  <Loader2 className="w-16 h-16 text-primary animate-spin relative z-10" />
                </div>
                
                <div className="h-8 mt-8 flex items-center justify-center overflow-hidden">
                  <AnimatePresence mode="wait">
                    <motion.p
                      key={loadingMsgIdx}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="text-lg font-medium text-foreground/80"
                    >
                      {LOADING_MESSAGES[loadingMsgIdx]}
                    </motion.p>
                  </AnimatePresence>
                </div>
              </motion.div>
            ) : activeData ? (
              <motion.div 
                key="results-view"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="w-full"
              >
                <div className="mb-8">
                  <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-2">
                    {title || activeData.meta.title || "Analysis Complete"}
                  </h1>
                  <p className="text-muted-foreground flex items-center gap-2 text-sm">
                    Analyzed {activeData.input.detectedSpeakers.join(" & ")} • {activeData.input.normalizedLength} characters
                  </p>
                </div>
                
                <AnalysisDashboard data={activeData} />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
