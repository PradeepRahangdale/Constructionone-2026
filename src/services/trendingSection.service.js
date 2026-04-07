import mongoose from 'mongoose';
import TrendingSection from '../models/trending/trendingSection.model.js';
import PlatformModule from '../models/platform/module.model.js';
import { sectionResolvers } from '../resolvers/sectionResolvers.js';
import { APIError } from '../middlewares/errorHandler.js';
import RedisCache from '../utils/redisCache.js';

export const trendingCacheKey = (slug, searchKeyword = '') => `trending:${slug}:${searchKeyword || 'all'}`;

export const invalidateTrending = async (moduleId) => {
    const mod = await PlatformModule.findById(moduleId).select("slug").lean();
    if (mod?.slug) {
        // Find existing cache keys pattern and delete (this is simple flush, in prod use pattern matching)
        // Since we may have search keywords cached, better to delete the exact 'all' cache
        await RedisCache.delete(trendingCacheKey(mod.slug, ''));
    }
};

export const buildTrending = async (identifier, searchKeyword = '') => {
    const isId = mongoose.Types.ObjectId.isValid(identifier);
    const query = isId
        ? { _id: identifier, isActive: true }
        : { slug: identifier, isActive: true };

    const module = await PlatformModule.findOne(query)
        .select('_id title slug')
        .lean();
    if (!module) throw new APIError(404, `Module "${identifier}" not found`);

    let sections = await TrendingSection.find({
        moduleId: module._id,
        isActive: true,
    })
        .sort({ order: 1 })
        .lean();

    if (!sections.length) return { module, sections: [] };

    // Option 2 Implementation: If user searches, drop non-product blocks
    if (searchKeyword && searchKeyword.trim() !== '') {
        sections = sections.filter(sec => sec.type === 'PRODUCT_LIST');
        // Inject search keyword into the section config for the resolver
        sections = sections.map(sec => ({ ...sec, searchKeyword: searchKeyword.trim() }));
    }

    const resolvedData = await Promise.all(
        sections.map((section) => {
            const resolver = sectionResolvers[section.type];
            if (!resolver) return Promise.resolve([]);
            return resolver(section).catch((err) => {
                console.error(`Resolver failed for ${section.type}:`, err);
                return []; 
            });
        }),
    );

    const result = sections.map((section, i) => ({
        key: section.key,
        type: section.type,
        title: section.title,
        order: section.order,
        data: resolvedData[i],
    }));

    return { module, sections: result };
};

// Admin CRUD for Trending Sections
export const createTrendingSection = async (data, userId) => {
    const section = await TrendingSection.create({ ...data, createdBy: userId });
    await invalidateTrending(data.moduleId);
    return section;
};

export const getAllTrendingSections = async (query) => {
    const { moduleId, isActive, page = 1, limit = 20 } = query;
    const filter = {};
    if (moduleId) filter.moduleId = moduleId;
    if (isActive === "true") filter.isActive = true;
    if (isActive === "false") filter.isActive = false;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [sections, total] = await Promise.all([
        TrendingSection.find(filter)
            .sort({ order: 1 })
            .skip(skip)
            .limit(parseInt(limit))
            .lean(),
        TrendingSection.countDocuments(filter),
    ]);
    return {
        sections,
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
    };
};

export const getTrendingSectionById = async (id) => {
    const section = await TrendingSection.findById(id).lean();
    if (!section) throw new APIError(404, "TrendingSection not found");
    return section;
};

export const updateTrendingSection = async (id, data) => {
    const section = await TrendingSection.findByIdAndUpdate(id, data, {
        new: true,
        runValidators: true,
    }).lean();
    if (!section) throw new APIError(404, "TrendingSection not found");
    await invalidateTrending(section.moduleId);
    return section;
};

export const removeTrendingSection = async (id) => {
    const section = await TrendingSection.findByIdAndDelete(id).lean();
    if (!section) throw new APIError(404, "TrendingSection not found");
    await invalidateTrending(section.moduleId);
    return section;
};

export const toggleTrendingSection = async (id) => {
    const section = await TrendingSection.findById(id);
    if (!section) throw new APIError(404, "TrendingSection not found");
    section.isActive = !section.isActive;
    await section.save({ validateBeforeSave: false });
    await invalidateTrending(section.moduleId);
    return section;
};
