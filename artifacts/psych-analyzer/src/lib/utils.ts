import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateColorsForSpeakers(speakers: string[]) {
  const colors = [
    "bg-indigo-100 text-indigo-900 border-indigo-200",
    "bg-teal-100 text-teal-900 border-teal-200",
    "bg-rose-100 text-rose-900 border-rose-200",
    "bg-amber-100 text-amber-900 border-amber-200",
    "bg-purple-100 text-purple-900 border-purple-200",
  ];
  
  const map: Record<string, string> = {};
  speakers.forEach((speaker, idx) => {
    map[speaker] = colors[idx % colors.length];
  });
  return map;
}
