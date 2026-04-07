import * as trendingService from '../../services/trendingSection.service.js';
import { catchAsync } from '../../middlewares/errorHandler.js';
import { ApiResponse } from '../../utils/ApiResponse.js';

export const createSection = catchAsync(async (req, res) => {
    const section = await trendingService.createTrendingSection(req.body, req.user._id);
    return res.status(201).json(new ApiResponse(201, section, 'Trending Section created successfully'));
});

export const getSections = catchAsync(async (req, res) => {
    const data = await trendingService.getAllTrendingSections(req.query);
    return res.status(200).json(new ApiResponse(200, data, 'Trending Sections retrieved successfully'));
});

export const getSectionById = catchAsync(async (req, res) => {
    const section = await trendingService.getTrendingSectionById(req.params.id);
    return res.status(200).json(new ApiResponse(200, section, 'Trending Section retrieved successfully'));
});

export const updateSection = catchAsync(async (req, res) => {
    const section = await trendingService.updateTrendingSection(req.params.id, req.body);
    return res.status(200).json(new ApiResponse(200, section, 'Trending Section updated successfully'));
});

export const deleteSection = catchAsync(async (req, res) => {
    const section = await trendingService.removeTrendingSection(req.params.id);
    return res.status(200).json(new ApiResponse(200, section, 'Trending Section deleted successfully'));
});

export const toggleSectionStatus = catchAsync(async (req, res) => {
    const section = await trendingService.toggleTrendingSection(req.params.id);
    const message = `Trending Section ${section.isActive ? 'activated' : 'deactivated'} successfully`;
    return res.status(200).json(new ApiResponse(200, section, message));
});
