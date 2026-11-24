import { createRemoteJWKSet, jwtVerify } from 'jose';
import {
  bearerAuthChallengeResponse,
  getOAuthProtectedResourceMetadataUrl,
  OAuthError,
  OAuthErrorCode,
  verifyBearerToken,
} from '@modelcontextprotocol/server';

export function createOAuth(config, metrics) {
  const resource = new URL(config.resource);
  const metadataUrl = getOAuthProtectedResourceMetadataUrl(resource);
  const keys = createRemoteJWKSet(new URL(config.jwksUri));
  const verifier = {
    async verifyAccessToken(token) {
      try {
        const { payload } = await jwtVerify(token, keys, {
          issuer: config.issuer,
          audience: config.resource,
          algorithms: ['RS256', 'PS256', 'ES256', 'EdDSA'],
          requiredClaims: ['exp', 'sub'],
          typ: 'at+jwt',
        });
        const clientId = payload.client_id ?? payload.azp;
        if (
          typeof clientId !== 'string' ||
          !clientId ||
          typeof payload.sub !== 'string' ||
          !payload.sub ||
          (payload.scope !== undefined && typeof payload.scope !== 'string')
        )
          throw new Error('Invalid claims');
        return {
          token,
          clientId,
          resource,
          expiresAt: payload.exp,
          scopes: (payload.scope ?? '').split(' ').filter(Boolean),
          extra: { subject: payload.sub, issuer: payload.iss },
        };
      } catch {
        throw new OAuthError(OAuthErrorCode.InvalidToken, 'Invalid access token');
      }
    },
  };
  return {
    path: new URL(metadataUrl).pathname,
    metadata: {
      resource: config.resource,
      authorization_servers: [config.issuer],
      scopes_supported: [
        ...new Set([
          ...Object.values(config.toolScopes).flat(),
          ...(metrics ? ['mcp:metrics'] : []),
        ]),
      ],
      bearer_methods_supported: ['header'],
    },
    async authenticate(req, res) {
      try {
        req.auth = await verifyBearerToken(req.headers.authorization, {
          verifier,
          expectedResource: resource,
          resourceMetadataUrl: metadataUrl,
        });
        return true;
      } catch (error) {
        const challenge = bearerAuthChallengeResponse(error, { resourceMetadataUrl: metadataUrl });
        res.writeHead(challenge.status, Object.fromEntries(challenge.headers));
        res.end(await challenge.text());
        return false;
      }
    },
  };
}
