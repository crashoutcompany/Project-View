import "@testing-library/jest-dom/jest-globals"

class ResizeObserverMock {
  observe() {}

  unobserve() {}

  disconnect() {}
}

if (!global.ResizeObserver) {
  global.ResizeObserver = ResizeObserverMock as typeof ResizeObserver
}

if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}
