import Foundation
import Capacitor
#if canImport(ActivityKit)
import ActivityKit
#endif

/// Starts, updates and ends the wind-down Live Activity.
///
/// This is the piece that appears in the Dynamic Island and on the Lock
/// Screen. It is deliberately a countdown to one moment — settle time —
/// because that is the only thing a sleep app should be shouting about in
/// the evening, and because a Live Activity that changes every second is
/// exactly the kind of thing this app is trying to be the opposite of.
///
/// Everything degrades: on iOS 16.0 and below, on devices without the
/// Dynamic Island, or when the user has Live Activities switched off, the
/// calls resolve with started/updated/ended false and the app carries on.
@objc(SleepSphereLiveActivityPlugin)
public class SleepSphereLiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {

    public let identifier = "SleepSphereLiveActivityPlugin"
    public let jsName = "SleepSphereLiveActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise)
    ]

    @objc func start(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        guard #available(iOS 16.2, *) else { return call.resolve(["started": false, "reason": "os"]) }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            return call.resolve(["started": false, "reason": "disabled"])
        }
        guard let settleAt = call.getDouble("sleepStart") else {
            return call.resolve(["started": false, "reason": "missing sleepStart"])
        }
        let windAt = call.getDouble("windStart") ?? settleAt
        let wakeAt = call.getDouble("wakeAt") ?? settleAt

        let attributes = WindDownAttributes(label: call.getString("label") ?? "Tonight")
        let state = WindDownAttributes.ContentState(
            windStart: Date(timeIntervalSince1970: windAt / 1000),
            settleBy: Date(timeIntervalSince1970: settleAt / 1000),
            wakeAt: Date(timeIntervalSince1970: wakeAt / 1000)
        )

        do {
            // Ends itself at the wake anchor so a forgotten activity does not
            // sit on the Lock Screen all day.
            let activity = try Activity.request(
                attributes: attributes,
                content: .init(state: state, staleDate: state.wakeAt),
                pushType: nil
            )
            call.resolve(["started": true, "id": activity.id])
        } catch {
            call.resolve(["started": false, "reason": error.localizedDescription])
        }
        #else
        call.resolve(["started": false, "reason": "unsupported"])
        #endif
    }

    @objc func update(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        guard #available(iOS 16.2, *) else { return call.resolve(["updated": false]) }
        guard let settleAt = call.getDouble("sleepStart") else {
            return call.resolve(["updated": false])
        }
        let windAt = call.getDouble("windStart") ?? settleAt
        let wakeAt = call.getDouble("wakeAt") ?? settleAt
        let state = WindDownAttributes.ContentState(
            windStart: Date(timeIntervalSince1970: windAt / 1000),
            settleBy: Date(timeIntervalSince1970: settleAt / 1000),
            wakeAt: Date(timeIntervalSince1970: wakeAt / 1000)
        )
        Task {
            for activity in Activity<WindDownAttributes>.activities {
                await activity.update(.init(state: state, staleDate: state.wakeAt))
            }
            await MainActor.run { call.resolve(["updated": true]) }
        }
        #else
        call.resolve(["updated": false])
        #endif
    }

    @objc func end(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        guard #available(iOS 16.2, *) else { return call.resolve(["ended": false]) }
        Task {
            for activity in Activity<WindDownAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
            await MainActor.run { call.resolve(["ended": true]) }
        }
        #else
        call.resolve(["ended": false])
        #endif
    }
}
