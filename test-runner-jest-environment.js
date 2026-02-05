const fs = require('fs')
const path = require('path')
const { setupPage } = require('@storybook/test-runner')
const PlaywrightEnvironment = require('jest-playwright-preset/lib/PlaywrightEnvironment').default

class CustomEnvironment extends PlaywrightEnvironment {
    async setup() {
        await super.setup()

        const browserName = this.global.browserName
        if (browserName === 'webkit' && process.env.CI) {
            try {
                await this.global.context.tracing.start({
                    screenshots: true,
                    snapshots: true,
                    sources: false,
                })
                this._webkitTracingEnabled = true
            } catch (err) {
                console.warn('[webkit-diagnostics] Failed to start tracing:', err.message)
                this._webkitTracingEnabled = false
            }
        }

        await setupPage(this.global.page, this.global.context)
    }

    async teardown() {
        if (this._webkitTracingEnabled && this._hasTestFailures) {
            try {
                const traceDir = 'frontend/__snapshots__/__failures__'
                if (!fs.existsSync(traceDir)) {
                    fs.mkdirSync(traceDir, { recursive: true })
                }
                const tracePath = path.join(traceDir, `webkit-trace-${Date.now()}.zip`)
                await this.global.context.tracing.stop({ path: tracePath })
            } catch (err) {
                console.warn('[webkit-diagnostics] Failed to save trace:', err.message)
            }
        } else if (this._webkitTracingEnabled) {
            try {
                await this.global.context.tracing.stop()
            } catch (err) {
                // ignore when discarding
            }
        }

        await super.teardown()
    }

    async handleTestEvent(event) {
        if (event.name === 'test_done' && event.test.errors.length > 0) {
            this._hasTestFailures = true
            const parentName = event.test.parent.parent.name.replace(/\W/g, '-').toLowerCase()
            const specName = event.test.parent.name.replace(/\W/g, '-').toLowerCase()
            await this.global.page
                .locator('body, main')
                .last()
                .screenshot({
                    path: `frontend/__snapshots__/__failures__/${parentName}--${specName}.png`,
                })
        }
        await super.handleTestEvent(event)
    }
}

module.exports = CustomEnvironment
