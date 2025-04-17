// src/StateService.ts
export class StateService {
  private static _instance: StateService;
  private _projectPath: string | null = null;
  private _isValidGitRepo: boolean = false;

  // Private constructor to prevent instantiation from outside.
  private constructor() {}

  // Use this method to get the single instance
  public static getInstance(): StateService {
    if (!StateService._instance) {
      StateService._instance = new StateService();
    }
    return StateService._instance;
  }

  // Getters and Setters for the state properties
  public get projectPath(): string | null {
    return this._projectPath;
  }

  public set projectPath(value: string | null) {
    this._projectPath = value;
  }

  public get isValidGitRepo(): boolean {
    return this._isValidGitRepo;
  }

  public set isValidGitRepo(value: boolean) {
    this._isValidGitRepo = value;
  }

  // Optional: Add helper methods to update state in a controlled manner
  public initializeProject(path: string, isRepo: boolean): void {
    this._projectPath = path;
    this._isValidGitRepo = isRepo;
  }
}

// Export a singleton instance so that all modules use the same service.
export const stateService = StateService.getInstance();
