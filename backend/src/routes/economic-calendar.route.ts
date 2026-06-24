import type { FastifyPluginAsync } from 'fastify';
import { rssFeedService } from '../services/rss-feed.service.js';

export const economicCalendarRoute: FastifyPluginAsync = async (fastify) => {

  fastify.get<{ Querystring: { source?: string; category?: string } }>(
    '/feed', async (req) => {
      const { source, category } = req.query;
      let data = await rssFeedService.getAllFeeds();
      if (source)   data = data.filter(i => i.source.toLowerCase() === source.toLowerCase());
      if (category) data = data.filter(i => i.category === category);
      return { success: true, data, meta: { total: data.length } };
    }
  );

  fastify.get('/sources', async () => {
    return { success: true, data: rssFeedService.listSources() };
  });

  fastify.post('/refresh', async () => {
    const data = await rssFeedService.refresh();
    return { success: true, data, meta: { total: data.length } };
  });
};

export default economicCalendarRoute;
