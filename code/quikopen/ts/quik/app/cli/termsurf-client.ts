/**
 * Minimal TermSurf host client: connect TERMSURF_SOCKET, send SetOverlay frames.
 */
import * as net from "node:net";

import { readTerminalGeometry, type PaneGeometry } from "./geometry.ts";
import {
  buildSetOverlayFrame,
  setOverlayDefaults,
  type SetOverlayFields,
} from "./termsurf-encode.ts";

export interface TermSurfEnv {
  socketPath: string;
  paneId: string;
}

export function readTermSurfEnv(
  env: NodeJS.ProcessEnv = process.env,
): TermSurfEnv | { error: string } {
  const socketPath = env.TERMSURF_SOCKET;
  const paneId = env.TERMSURF_PANE_ID;
  if (!socketPath) {
    return {
      error: "TERMSURF_SOCKET not set — run quik inside Astrohacker TermSurf",
    };
  }
  if (!paneId) {
    return {
      error: "TERMSURF_PANE_ID not set — run quik inside a TermSurf pane",
    };
  }
  return { socketPath, paneId };
}

export interface OverlayOptions {
  browser?: string;
  profile?: string;
}

export class TermSurfClient {
  private socket: net.Socket | null = null;
  private paneId: string;
  private url: string;
  private geometry: PaneGeometry;
  private browser: string;
  private profile: string;

  constructor(
    paneId: string,
    url: string,
    geometry: PaneGeometry,
    overlay: OverlayOptions = {},
  ) {
    this.paneId = paneId;
    this.url = url;
    this.geometry = geometry;
    this.browser = overlay.browser ?? "";
    this.profile = overlay.profile ?? "default";
  }

  static async connect(
    env: TermSurfEnv,
    url: string,
    geometry: PaneGeometry = readTerminalGeometry(),
    overlay: OverlayOptions = {},
  ): Promise<TermSurfClient> {
    const client = new TermSurfClient(env.paneId, url, geometry, overlay);
    await client.open(env.socketPath);
    client.sendOverlay();
    return client;
  }

  private open(socketPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const s = net.connect(socketPath);
      s.once("connect", () => {
        this.socket = s;
        // Drain host messages so the socket buffer does not fill
        s.on("data", () => {
          // No host reply is needed; consuming data keeps the stream flowing.
        });
        resolve();
      });
      s.once("error", reject);
    });
  }

  private fields(): SetOverlayFields {
    return setOverlayDefaults({
      paneId: this.paneId,
      col: this.geometry.col,
      row: this.geometry.row,
      width: this.geometry.width,
      height: this.geometry.height,
      url: this.url,
      browser: this.browser,
      profile: this.profile,
    });
  }

  sendOverlay(): void {
    if (!this.socket) return;
    const frame = buildSetOverlayFrame(this.fields());
    this.socket.write(frame.bytes);
  }

  /** Update geometry (e.g. SIGWINCH) and re-send SetOverlay. */
  resize(geometry: PaneGeometry): void {
    this.geometry = geometry;
    this.sendOverlay();
  }

  /** Close host connection — clears overlays owned by this TUI socket. */
  close(): void {
    if (this.socket) {
      try {
        this.socket.destroy();
      } catch {
        /* */
      }
      this.socket = null;
    }
  }
}
