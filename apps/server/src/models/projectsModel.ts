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
	type: {
		type: String,
		required: true
	},
	name: String,
	visible: {
		type: Boolean,
		default: true
	},
	position: {
		x: Number,
		y: Number,
		z: Number
	},
	rotation: {
		x: Number,
		y: Number,
		z: Number
	},
	scale: {
		x: Number,
		y: Number,
		z: Number
	},
	// 对于 GLTF 模型
	url: String,
	modifications: mongoose.Schema.Types.Mixed,
	// 对于基础几何体
	geometry: {
		type: mongoose.Schema.Types.Mixed
	},
	material: {
		color: Number,
		roughness: Number,
		metalness: Number,
		blending: Number,
		side: Number,
		transparent: Boolean,
		depthTest: Boolean,
		depthWrite: Boolean,
		vertexColors: Boolean
	},
}, {
	timestamps: true
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
	name: {
		type: String,
		required: true
	},
	description: String,
	thumbnail: String,
	environmentUrl: String, // 环境贴图 URL (本地相对路径)
	cameraFar: {
		type: Number,
		default: 1000000
	},

	// 云端绝对路径 (又拍云 CDN)
	cloudUrls: {
		environment: String,    // 又拍云环境贴图 URL
		baseMap: String         // 又拍云底图 URL
	},

	// GIS 配置
	gisConfig: {
		enable: {
			type: Boolean,
			default: true
		},
		center: {
			lng: Number,
			lat: Number
		},
		size: Number, // 选框边长（米）
		bounds: {
			maxLat: Number,
			minLat: Number,
			maxLng: Number,
			minLng: Number
		},
		// 兼容旧版
		range: {
			length: Number,
			width: Number
		},
		projection: String,
		gridVisible: {
			type: Boolean,
			default: false
		},
		baseMapUrl: String, // 底图 URL
		showBaseMap: {
			type: Boolean,
			default: false
		}
	},
	lastModified: {
		type: Date,
		default: Date.now
	},
	objectCount: {
		type: Number,
		default: 0
	},
	backgroundColor: {
		type: String,
		default: '#ffffff'
	},
	ambientIntensity: {
		type: Number,
		default: 1.0
	}
}, {
	timestamps: true
});

const SceneModel = mongoose.model('Scene', SceneSchema)
const SceneObjectModel = mongoose.model('SceneObject', SceneObjectSchema)

export { SceneModel, SceneObjectModel }
