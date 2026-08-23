import useAssetsStore from '../store/assets'

export default class Preloader {
  loadingPercent = document.querySelector('#loading-percent')!
  loading = document.querySelector('#loading')!
  startBtn = document.querySelector('#start-btn')!
  preloadOverlay = document.querySelector('#preload-overlay')!

  constructor() {
    const stateStore = useAssetsStore()

    const numOfTotalAssets = stateStore.getAssets().length

    stateStore.$subscribe((_, state) => {
      let numOfLoadedAssets = Object.keys(state.loadedAssets).length
      const percent = Math.trunc((numOfLoadedAssets / numOfTotalAssets) * 100)

      this.loadingPercent.innerHTML = `${percent}%`

      if (percent >= 100) {
        this.start()
      }
    })
  }

  start() {
    this.loading.classList.add('hide')

    setTimeout(() => {
      this.loading.remove()
      this.startBtn.classList.add('show')
    }, 800)
    this.startBtn.addEventListener(
      'click',
      () => {
        this.startBtn.classList.add('hide')
        setTimeout(() => {
          this.preloadOverlay.remove()
        }, 1000)
      },
      { once: true },
    )
  }
}
