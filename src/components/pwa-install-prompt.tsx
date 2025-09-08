"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setOpen(true);
    };
    window.addEventListener("beforeinstallprompt", handler as EventListener);
    return () => window.removeEventListener("beforeinstallprompt", handler as EventListener);
  }, []);

  const onInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setOpen(false);
      setDeferredPrompt(null);
    } else {
      setOpen(false);
    }
  };

  // Hide if already installed
  useEffect(() => {
    const isStandalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || (navigator as any).standalone;
    if (isStandalone) setOpen(false);
  }, []);

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Install AHA Rewards</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Install this app on your device for a faster, app-like experience.
        </p>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>Not now</Button>
          <Button onClick={onInstall}>Install</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


