import * as model from '../model'
import { Router } from 'express'
import { router as users } from './users'
import { router as sessions } from './sessions'
import { router as workspaces } from './workspaces'
export const router = Router();

router.use('/users', users);
router.use('/sessions', sessions);
router.use('/workspaces', workspaces);
