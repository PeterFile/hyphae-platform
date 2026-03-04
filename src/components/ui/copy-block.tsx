"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CopyBlockProps {
  text: string;
  className?: string;
  children?: React.ReactNode;
}

export function CopyBlock({ text, className, children }: CopyBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  return (
    <div className={cn("group relative", className)}>
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-2 top-2 h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100 bg-background/50 hover:bg-background"
        onClick={handleCopy}
        title="Copy to clipboard"
      >
        {copied ? (
          <Check className="h-3 w-3 text-emerald-500" />
        ) : (
          <Copy className="h-3 w-3 text-muted-foreground" />
        )}
      </Button>
      {children ? (
        children
      ) : (
        <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-muted p-4 text-sm pt-8">
          <code>{text}</code>
        </pre>
      )}
    </div>
  );
}
