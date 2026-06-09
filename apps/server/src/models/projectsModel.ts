import mongoose from 'mongoose'
import type { SerializedObject, SceneData } from '@scene-prod/shared'

/**
 * 场景对象数据模型
 * 对应前端的 serializeObject 结构
 */
const SceneObjectSchema = new mongoose.Schema<SerializedObject>({
	id: {
		type: String,
		required: true,
		unique: true
	},
	sceneId: {
		type: String,
		required: true,
		index: true
	},
}, {
	timestamps: true,
	strict: false
});

/**
 * 场景元数据模型
 */
const SceneSchema = new mongoose.Schema<SceneData>({
	sceneId: {
		type: String,
		required: true,
		unique: true,
		default: 'default'
	},
}, {
	timestamps: true,
	strict: false
});

const SceneModel = mongoose.model('Scene', SceneSchema)
const SceneObjectModel = mongoose.model('SceneObject', SceneObjectSchema)

export { SceneModel, SceneObjectModel }
