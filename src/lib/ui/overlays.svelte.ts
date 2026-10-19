export interface AlertResponse {
  id: string;
  label: string;
  appearance?: "suggested" | "destructive";
}

export interface AlertOptions {
  heading: string;
  body?: string;
  responses: AlertResponse[];
  /** Activated by Enter. */
  defaultResponse?: string;
  /** Returned when the dialog is dismissed with Escape or a click outside. */
  closeResponse: string;
}

interface OpenAlert extends AlertOptions {
  key: number;
  resolve: (id: string) => void;
}

interface Toast {
  id: number;
  title: string;
}

let nextToastId = 1;
let nextAlertKey = 1;

class Overlays {
  alerts = $state<OpenAlert[]>([]);
  toasts = $state<Toast[]>([]);
  dialog = $state<"shortcuts" | "about" | null>(null);

  /** Shows an AdwAlertDialog-style dialog and resolves with the chosen response id. */
  alert(options: AlertOptions): Promise<string> {
    return new Promise((resolve) => {
      // Compared by key: objects stored in $state are proxies, so identity checks would fail.
      const key = nextAlertKey++;
      this.alerts.push({
        ...options,
        key,
        resolve: (id) => {
          this.alerts = this.alerts.filter((a) => a.key !== key);
          resolve(id);
        },
      });
    });
  }

  /** Shows an AdwToast-style notification at the bottom of the window. */
  toast(title: string, timeout = 5000) {
    const id = nextToastId++;
    // Like AdwToastOverlay, one toast is visible at a time; the newest replaces older ones.
    this.toasts = [{ id, title }];
    setTimeout(() => this.dismissToast(id), timeout);
  }

  dismissToast(id: number) {
    this.toasts = this.toasts.filter((t) => t.id !== id);
  }
}

export const overlays = new Overlays();
