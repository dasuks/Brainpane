export type PanelAction = 'open' | 'sync' | 'hide' | 'close';

/** Invocation-local view control; never part of an LLM semantic patch. */
export class PanelControl {
  revision = 0;
  action: PanelAction = 'hide';
  loadingSince: number | null = null;
  request(action: PanelAction) {
    this.action = action;
    this.loadingSince = action === 'open' || action === 'sync' ? Date.now() : null;
    this.revision++;
  }
  ready() { this.loadingSince = null; }
}
