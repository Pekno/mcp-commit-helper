import { z, ZodRawShape } from "zod";

/**
 * A builder class for creating tools in a fluent style, inspired by Discord.js's SlashCommandBuilder.
 */
export class ToolCommandBuilder {
  private _name = "";
  private _description = "";
  private _parameters: ZodRawShape = {};

  /**
   * Sets the name of the tool.
   */
  public setName(name: string): this {
    this._name = name;
    return this;
  }

  /**
   * Gets the name of the tool.
   */
  public getName(): string {
    return this._name;
  }

  /**
   * Sets the description of the tool.
   */
  public setDescription(description: string): this {
    this._description = description;
    return this;
  }

  /**
   * Gets the description of the tool.
   */
  public getDescription(): string {
    return this._description;
  }

  /**
   * Sets the parameter schema for the tool.
   * Expect an object with a Zod schema shape.
   */
  public setParameters(parameters: ZodRawShape): this {
    this._parameters = parameters;
    return this;
  }

  /**
   * Gets the parameters of the tool.
   */
  public getParameters(): ZodRawShape {
    return this._parameters;
  }
}
