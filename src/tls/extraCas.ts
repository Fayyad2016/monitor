import tls from "node:tls";
import { RAPIDSSL_TLS_RSA_CA_G1_PEM } from "./rapidsslIntermediate.js";

export function trustedCertificateAuthorities(): string[] {
  return [...tls.rootCertificates, RAPIDSSL_TLS_RSA_CA_G1_PEM];
}
