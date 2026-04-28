declare module "@mariozechner/pi-coding-agent" {
  export type ExtensionAPI = any;
  export type ExtensionContext = any;
}

declare module "@mariozechner/pi-ai" {
  export const StringEnum: any;
}

declare module "typebox" {
  export const Type: any;
}

declare module "node:fs/promises" {
  export const mkdir: any;
  export const readFile: any;
  export const writeFile: any;
}

declare module "node:path" {
  export const join: any;
}
