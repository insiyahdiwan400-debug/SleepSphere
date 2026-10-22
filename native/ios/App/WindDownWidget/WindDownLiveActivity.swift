import SwiftUI
#if canImport(ActivityKit)
import ActivityKit
import WidgetKit

/// The Lock Screen and Dynamic Island presentation of tonight's wind-down.
///
/// Deliberately quiet: one countdown, one time, no score. Anything more
/// insistent would be at odds with what the app is asking of you at 9pm.
@available(iOS 16.2, *)
struct WindDownLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: WindDownAttributes.self) { context in
            // Lock Screen / banner
            HStack(spacing: 14) {
                Image(systemName: "moon.stars")
                    .font(.title2)
                    .foregroundStyle(Color(red: 0.76, green: 0.63, blue: 0.41))
                VStack(alignment: .leading, spacing: 3) {
                    Text("Settle by \(context.state.settleBy, style: .time)")
                        .font(.headline)
                    Text(context.state.settleBy, style: .relative)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 3) {
                    Text("Up at").font(.caption2).foregroundStyle(.secondary)
                    Text(context.state.wakeAt, style: .time).font(.subheadline.weight(.semibold))
                }
            }
            .padding(16)
            .activityBackgroundTint(Color.black.opacity(0.55))
            .activitySystemActionForegroundColor(Color(red: 0.91, green: 0.89, blue: 0.85))

        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label("Wind down", systemImage: "moon.stars")
                        .font(.caption)
                        .foregroundStyle(Color(red: 0.76, green: 0.63, blue: 0.41))
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(context.state.wakeAt, style: .time)
                        .font(.caption.weight(.semibold))
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.state.settleBy, style: .relative)
                        .font(.title3.weight(.semibold))
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text("Settle by \(context.state.settleBy, style: .time)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            } compactLeading: {
                Image(systemName: "moon.stars")
                    .foregroundStyle(Color(red: 0.76, green: 0.63, blue: 0.41))
            } compactTrailing: {
                Text(context.state.settleBy, style: .timer)
                    .monospacedDigit()
                    .frame(maxWidth: 44)
            } minimal: {
                Image(systemName: "moon.stars")
                    .foregroundStyle(Color(red: 0.76, green: 0.63, blue: 0.41))
            }
            .keylineTint(Color(red: 0.76, green: 0.63, blue: 0.41))
        }
    }
}
#endif
