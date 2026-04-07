import { Router } from 'express';
import { getPublicModules, getHome } from '../../controllers/platform/home.controller.js';
import { getTrending } from '../../controllers/platform/trending.controller.js';

const router = Router();

// Public: platform modules list
router.get('/modules', getPublicModules);

// Public: dynamic home screen per module (slug ya moduleId dono chalega)
router.get('/home/:identifier', getHome);

// Public: dynamic trending screen per module with internal search filters 
router.get('/trending/:identifier', getTrending);

export default router;
