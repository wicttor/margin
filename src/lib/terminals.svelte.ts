import { terminalKill } from "./api";

let nextId = 1;

export class TerminalSession {
  readonly id = nextId++;
  /** Shown as "Terminal 2" until the shell sets a title of its own. */
  readonly number: number;
  title = $state("");
  /** The shell's id in the backend, once it has started. */
  ptyId: number | null = null;

  constructor(number: number) {
    this.number = number;
  }

  get name() {
    return this.title || `Terminal ${this.number}`;
  }
}

class Terminals {
  sessions = $state<TerminalSession[]>([]);
  activeId = $state<number | null>(null);
  /** The terminal area below the documents. Hiding it keeps the shells running. */
  panelOpen = $state(false);
  panelHeight = $state(280);

  active = $derived(this.sessions.find((s) => s.id === this.activeId) ?? null);

  create() {
    const number = Math.max(0, ...this.sessions.map((s) => s.number)) + 1;
    const session = new TerminalSession(number);
    this.sessions.push(session);
    this.show(session);
  }

  show(session: TerminalSession) {
    this.activeId = session.id;
    this.panelOpen = true;
  }

  /** Shows the panel, starting a terminal if there is none yet. */
  togglePanel() {
    if (this.sessions.length === 0) this.create();
    else this.panelOpen = !this.panelOpen;
  }

  cycle(step: number) {
    if (this.sessions.length < 2 || !this.active) return;
    const index = this.sessions.indexOf(this.active);
    this.show(this.sessions[(index + step + this.sessions.length) % this.sessions.length]);
  }

  /** Ends the shell (if still running) and removes the terminal. */
  close(session: TerminalSession) {
    if (session.ptyId !== null) void terminalKill(session.ptyId).catch(() => {});
    this.remove(session);
  }

  /** Removes a terminal whose shell has ended. */
  remove(session: TerminalSession) {
    const index = this.sessions.findIndex((s) => s.id === session.id);
    if (index < 0) return;
    this.sessions.splice(index, 1);
    if (this.activeId === session.id) {
      this.activeId = (this.sessions[index] ?? this.sessions[index - 1])?.id ?? null;
    }
    if (this.sessions.length === 0) this.panelOpen = false;
  }
}

export const terminals = new Terminals();
