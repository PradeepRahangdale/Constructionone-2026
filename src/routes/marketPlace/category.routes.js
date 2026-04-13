import { Router } from 'express';
import { getCategoryTree, getCategoryTreeForAdmin } from '../../controllers/marketPlace/category.controller.js';

const router = Router();

router.get('/categories', getCategoryTree);
router.get('/categories/admin', getCategoryTreeForAdmin);

export default router;

