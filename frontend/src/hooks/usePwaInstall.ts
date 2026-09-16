import { useCallback, useEffect, useState } from "react";

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const standalone = () =>
  (typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches) ||
  Boolean((navigator as Navigator & { standalone?: boolean }).standalone);

const iosDevice = () =>
  /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export function usePwaInstall() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(standalone);

  useEffect(() => {
    const displayMode =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(display-mode: standalone)")
        : null;
    const handlePrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      setInstallPrompt(null);
      setInstalled(true);
    };
    const handleDisplayMode = () => setInstalled(standalone());

    window.addEventListener("beforeinstallprompt", handlePrompt);
    window.addEventListener("appinstalled", handleInstalled);
    displayMode?.addEventListener("change", handleDisplayMode);

    return () => {
      window.removeEventListener("beforeinstallprompt", handlePrompt);
      window.removeEventListener("appinstalled", handleInstalled);
      displayMode?.removeEventListener("change", handleDisplayMode);
    };
  }, []);

  const install = useCallback(async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") setInstallPrompt(null);
  }, [installPrompt]);

  return {
    canPrompt: installPrompt !== null,
    install,
    installed,
    isIos: iosDevice(),
    isSecure: window.isSecureContext !== false,
  };
}
