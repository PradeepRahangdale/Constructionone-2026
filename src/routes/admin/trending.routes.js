import { Router } from 'express';
import * as trendingController from '../../controllers/admin/trendingSection.controller.js';

const router = Router();

// Routes are grouped under /admin/trending-sections
// and are protected globally in src/routes/admin/index.js

router.route('/')
    .get(trendingController.getSections)
    .post(trendingController.createSection);

router.route('/:id')
    .get(trendingController.getSectionById)
    .put(trendingController.updateSection)
    .delete(trendingController.deleteSection);

router.patch('/:id/toggle', trendingController.toggleSectionStatus);

export default router;
