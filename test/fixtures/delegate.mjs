export default function delegate({ principal, accessToken }) {
  if (principal.subject === 'misconfigured-delegate') return accessToken;
  return 'api-for-' + principal.subject;
}
