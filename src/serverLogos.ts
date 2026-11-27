import {
    siAirtable,
    siAsana,
    siAtlassian,
    siClickup,
    siCloudflare,
    siConfluence,
    siDatadog,
    siDiscord,
    siDocker,
    siFigma,
    siFirebase,
    siGithub,
    siGitlab,
    siGmail,
    siGooglecalendar,
    siGooglecloud,
    siGoogledrive,
    siGrafana,
    siHubspot,
    siIntercom,
    siJira,
    siLinear,
    siMailchimp,
    siMongodb,
    siNeon,
    siNetlify,
    siNotion,
    siPostgresql,
    siPrisma,
    siRailway,
    siRedis,
    siRender,
    siResend,
    siSentry,
    siShopify,
    siStripe,
    siSupabase,
    siTrello,
    siVercel,
    siZapier,
    type SimpleIcon,
} from 'simple-icons'

/**
 * Logos for MCP servers people commonly connect, keyed by the server name with everything
 * but letters and digits removed. Named imports keep the rest of simple-icons out of the bundle.
 * PostHog is not here: it uses the official logomark from @posthog/brand.
 */
const LOGOS: Record<string, SimpleIcon> = {
    airtable: siAirtable,
    asana: siAsana,
    atlassian: siAtlassian,
    clickup: siClickup,
    cloudflare: siCloudflare,
    confluence: siConfluence,
    datadog: siDatadog,
    discord: siDiscord,
    docker: siDocker,
    figma: siFigma,
    firebase: siFirebase,
    github: siGithub,
    gitlab: siGitlab,
    gmail: siGmail,
    googlecalendar: siGooglecalendar,
    googlecloud: siGooglecloud,
    googledrive: siGoogledrive,
    grafana: siGrafana,
    hubspot: siHubspot,
    intercom: siIntercom,
    jira: siJira,
    linear: siLinear,
    mailchimp: siMailchimp,
    mongodb: siMongodb,
    neon: siNeon,
    netlify: siNetlify,
    notion: siNotion,
    postgres: siPostgresql,
    postgresql: siPostgresql,
    prisma: siPrisma,
    railway: siRailway,
    redis: siRedis,
    render: siRender,
    resend: siResend,
    sentry: siSentry,
    shopify: siShopify,
    stripe: siStripe,
    supabase: siSupabase,
    trello: siTrello,
    vercel: siVercel,
    zapier: siZapier,
}

/**
 * Looks the server name up whole, then word by word, so `Vercel`, `vercel-mcp`, `google_drive`
 * and `acme-github` all match but `renderer` does not match Render.
 */
export function serverLogo(server: string): SimpleIcon | undefined {
    const words = server
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean)
    const pairs = words.slice(1).map((word, index) => words[index] + word)
    for (const candidate of [words.join(''), ...pairs, ...words]) {
        if (LOGOS[candidate]) {
            return LOGOS[candidate]
        }
    }
    return undefined
}
