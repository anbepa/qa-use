export class AgentControlService {
  private static paused = false

  static isPaused(): boolean {
    return this.paused
  }

  static setPaused(paused: boolean) {
    this.paused = paused
  }
}
