import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import draco3d from 'draco3dgltf';
import type {DecoderModule, EncoderModule} from 'draco3dgltf'


// 缓存 Draco 模块实例
let dracoDecoderModule: DecoderModule | null = null;
let dracoEncoderModule: EncoderModule | null = null;


/**
 * 创建 NodeIO 实例
 */
export async function createNodeIO(): Promise<NodeIO> {
  if(!dracoDecoderModule) {
    dracoDecoderModule = await draco3d.createDecoderModule()
  }
  if(!dracoEncoderModule) {
    dracoEncoderModule = await draco3d.createEncoderModule()
  }

  return new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'draco3d.decoder': dracoDecoderModule,
      'draco3d.encoder': dracoEncoderModule
    })
}