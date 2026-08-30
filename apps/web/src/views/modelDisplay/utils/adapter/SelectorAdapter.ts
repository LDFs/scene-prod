import { Object3D } from "three";
import ISelectorAdapter from "./ISelectorAdapter";

import useSceneStore from "../../store/scene";

export default class SelectorAdapter extends ISelectorAdapter {
  private store: ReturnType<typeof useSceneStore>
  constructor() {
    super()
    this.store = useSceneStore()
  }

  selectObject(object: Object3D) {
    this.store.setSelectObject(object)
  }
}

