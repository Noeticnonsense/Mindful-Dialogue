import { useMemo } from "react";
import { cn, generateColorsForSpeakers } from "@/lib/utils";
import type { ParsedMessage } from "@workspace/api-client-react";

export function ChatTranscript({ messages }: { messages: ParsedMessage[] }) {
  const speakers = useMemo(() => Array.from(new Set(messages.map(m => m.speaker))), [messages]);
  const speakerColors = useMemo(() => generateColorsForSpeakers(speakers), [speakers]);

  return (
    <div className="flex flex-col space-y-4 p-4 md:p-6 bg-slate-50/50 rounded-2xl border shadow-inner custom-scrollbar overflow-y-auto max-h-[600px]">
      {messages.map((msg, index) => {
        const isFirstSpeaker = msg.speaker === speakers[0];
        
        return (
          <div 
            key={msg.id || index} 
            className={cn(
              "flex flex-col max-w-[85%] animate-in slide-in-from-bottom-2 fade-in duration-300",
              isFirstSpeaker ? "self-start items-start" : "self-end items-end"
            )}
            style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'both' }}
          >
            <span className="text-xs font-medium text-muted-foreground mb-1 ml-1 mr-1">
              {msg.speaker}
            </span>
            <div className={cn(
              "px-4 py-3 rounded-2xl border shadow-sm text-sm leading-relaxed",
              isFirstSpeaker 
                ? "bg-white border-border rounded-tl-sm" 
                : cn("rounded-tr-sm", speakerColors[msg.speaker] || "bg-primary/10 border-primary/20 text-foreground")
            )}>
              {msg.text}
            </div>
          </div>
        );
      })}
    </div>
  );
}
