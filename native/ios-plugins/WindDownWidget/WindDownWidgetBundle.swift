import SwiftUI
import WidgetKit

@main
struct WindDownWidgetBundle: WidgetBundle {
    var body: some Widget {
        if #available(iOS 16.2, *) {
            WindDownLiveActivity()
        }
    }
}
