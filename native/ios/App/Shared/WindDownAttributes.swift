import Foundation
#if canImport(ActivityKit)
import ActivityKit

/// Shared between the app and the widget extension, so this file must be a
/// member of BOTH targets in Xcode. Forgetting that is the single most
/// common reason a Live Activity silently fails to appear.
public struct WindDownAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        public var windStart: Date
        public var settleBy: Date
        public var wakeAt: Date

        public init(windStart: Date, settleBy: Date, wakeAt: Date) {
            self.windStart = windStart
            self.settleBy = settleBy
            self.wakeAt = wakeAt
        }
    }

    public var label: String
    public init(label: String) { self.label = label }
}
#endif
