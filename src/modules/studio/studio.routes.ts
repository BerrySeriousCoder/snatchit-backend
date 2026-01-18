import { Router } from 'express';
import multer from 'multer';
import { studioController } from './studio.controller';
import { authenticateUser } from '../../middleware/auth';

const router = Router();

// Multer config
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// Public routes (if any)
router.get('/models', studioController.getModels);

// Protected routes
router.use(authenticateUser);
router.post('/projects', studioController.createProject);
router.patch('/projects/:projectId', studioController.updateProject);
router.get('/projects', studioController.getUserProjects);
router.get('/projects/:projectId/assets', studioController.getProjectAssets);
router.get('/projects/:projectId/generations', studioController.getProjectGenerations);
router.post('/generate', studioController.generate);
router.get('/generations/:generationId', studioController.getGeneration);
router.post('/assets', upload.single('file'), studioController.uploadAsset);
router.get('/download', studioController.getDownloadUrl);
router.post('/remove-background', studioController.removeBackground);
router.post('/composite-with-color', studioController.compositeWithColor);

// User Models
router.get('/projects/:projectId/user-models', studioController.getUserModels);
router.post('/projects/:projectId/user-models', upload.single('file'), studioController.uploadUserModel);
router.delete('/user-models/:modelId', studioController.deleteUserModel);

// Poses
import { posesController } from './poses.controller';
router.get('/poses/stock', posesController.getStockPoses);
router.get('/poses/user', posesController.getUserPoses);
router.post('/poses', upload.single('file'), posesController.uploadPose);
router.delete('/poses/:poseId', posesController.deletePose);

// Presets (Scenes & Lighting)
import { presetsController } from './presets.controller';
router.get('/presets/scenes', presetsController.getScenePresets);
router.get('/presets/lighting', presetsController.getLightingPresets);

// Props
import { propsController } from './props.controller';
router.get('/props/stock', propsController.getStockProps);
router.get('/props/user', propsController.getUserProps);
router.post('/props', upload.single('file'), propsController.uploadProp);
router.post('/props/text', propsController.createTextProp);
router.delete('/props/:propId', propsController.deleteProp);

export default router;
