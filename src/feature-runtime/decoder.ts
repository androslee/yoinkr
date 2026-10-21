// Plain messages use the original Base64Message formatter. No custom decoders.
const plain = (message: any) => message ? {message, decoder: 0} : undefined
export const useDecoder = (_node: any) => plain
