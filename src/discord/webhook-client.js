const DISCORD_API_BASE = 'https://discord.com/api/v10';

export class DiscordInteractionWebhookClient {
  constructor({ applicationId, interactionToken, fetchImpl = fetch } = {}) {
    if (!applicationId || !interactionToken) {
      throw new TypeError('Discord Webhook 回覆需要 applicationId 與 interactionToken');
    }

    this.applicationId = applicationId;
    this.interactionToken = interactionToken;
    this.fetch = fetchImpl;
  }

  async editOriginal(payload) {
    return this.request(
      `/webhooks/${this.applicationId}/${this.interactionToken}/messages/@original`,
      { method: 'PATCH', payload },
    );
  }

  async followUp(payload) {
    return this.request(
      `/webhooks/${this.applicationId}/${this.interactionToken}`,
      { method: 'POST', payload },
    );
  }

  async request(path, { method, payload }) {
    const response = await this.fetch(`${DISCORD_API_BASE}${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        allowed_mentions: { parse: [] },
        ...payload,
      }),
    });

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      throw new Error(
        `Discord Webhook 回傳 HTTP ${response.status}${detail ? `：${detail}` : ''}`,
      );
    }

    if (response.status === 204) return null;
    const contentType = response.headers.get('content-type') ?? '';
    return contentType.includes('application/json') ? response.json() : null;
  }
}
