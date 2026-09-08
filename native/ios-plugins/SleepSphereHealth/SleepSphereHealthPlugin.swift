import Foundation
import Capacitor
import HealthKit

/// Reads the few HealthKit values SleepSphere can actually use, and nothing else.
///
/// Design rules this file sticks to, because App Review reads them and so do users:
///   - read-only. The app never writes to Health.
///   - the smallest possible type set. Requesting more than you use is the
///     fastest way to a rejection and the fastest way to lose trust.
///   - every failure resolves rather than rejects, with a null-ish payload.
///     The web layer treats Health as a convenience over manual entry, so a
///     refusal must look the same as "not available" and never strand a flow.
@objc(SleepSphereHealthPlugin)
public class SleepSphereHealthPlugin: CAPPlugin, CAPBridgedPlugin {

    public let identifier = "SleepSphereHealthPlugin"
    public let jsName = "SleepSphereHealth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "activitySummary", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sleepLastNight", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cycleContext", returnType: CAPPluginReturnPromise)
    ]

    private let store = HKHealthStore()

    private var readTypes: Set<HKObjectType> {
        var types = Set<HKObjectType>()
        if let sleep = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) { types.insert(sleep) }
        if let energy = HKObjectType.quantityType(forIdentifier: .activeEnergyBurned) { types.insert(energy) }
        if let steps = HKObjectType.quantityType(forIdentifier: .stepCount) { types.insert(steps) }
        if let exercise = HKObjectType.quantityType(forIdentifier: .appleExerciseTime) { types.insert(exercise) }
        if let flow = HKObjectType.categoryType(forIdentifier: .menstrualFlow) { types.insert(flow) }
        return types
    }

    // MARK: - Availability and consent

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": HKHealthStore.isHealthDataAvailable()])
    }

    @objc func requestAuthorization(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.resolve(["granted": false, "reason": "unavailable"])
            return
        }
        // toShare is empty: SleepSphere never writes to Health.
        store.requestAuthorization(toShare: [], read: readTypes) { granted, error in
            // `granted` here means the sheet completed, not that every type
            // was allowed — iOS deliberately hides per-type read decisions.
            call.resolve([
                "granted": granted && error == nil,
                "reason": error?.localizedDescription ?? ""
            ])
        }
    }

    // MARK: - Activity

    /// Active minutes, active energy and steps over the last `days` days,
    /// used to estimate how much repair the body is owed tonight.
    @objc func activitySummary(_ call: CAPPluginCall) {
        let days = max(1, min(call.getInt("days") ?? 1, 7))
        guard HKHealthStore.isHealthDataAvailable() else { return call.resolve([:]) }

        let end = Date()
        guard let start = Calendar.current.date(byAdding: .day, value: -days, to: end) else {
            return call.resolve([:])
        }
        let period = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)

        let group = DispatchGroup()
        var activeMinutes: Double?
        var activeEnergy: Double?
        var steps: Double?

        func sum(_ identifier: HKQuantityTypeIdentifier, unit: HKUnit, into sink: @escaping (Double?) -> Void) {
            guard let type = HKObjectType.quantityType(forIdentifier: identifier) else { return }
            group.enter()
            let query = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: period,
                                          options: .cumulativeSum) { _, statistics, _ in
                sink(statistics?.sumQuantity()?.doubleValue(for: unit))
                group.leave()
            }
            store.execute(query)
        }

        sum(.appleExerciseTime, unit: .minute()) { activeMinutes = $0 }
        sum(.activeEnergyBurned, unit: .kilocalorie()) { activeEnergy = $0 }
        sum(.stepCount, unit: .count()) { steps = $0 }

        group.notify(queue: .main) {
            var payload: [String: Any] = [:]
            // Fall back to an energy-derived estimate when Exercise Time is
            // absent, which is common on iPhone-only setups with no Watch.
            if let minutes = activeMinutes, minutes > 0 {
                payload["activeMinutes"] = Int(minutes.rounded())
            } else if let energy = activeEnergy {
                payload["activeMinutes"] = Int((energy / 7.0).rounded())
            }
            if let energy = activeEnergy { payload["activeEnergy"] = Int(energy.rounded()) }
            if let count = steps { payload["steps"] = Int(count.rounded()) }
            call.resolve(payload)
        }
    }

    // MARK: - Sleep

    /// Last night as Health recorded it, collapsed into the four numbers the
    /// morning record asks for. Anything Health cannot tell us is omitted so
    /// the flow asks the person instead of inventing a value.
    @objc func sleepLastNight(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable(),
              let type = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else {
            return call.resolve([:])
        }

        // A generous window: people go to bed before midnight and lie in.
        let now = Date()
        guard let windowStart = Calendar.current.date(byAdding: .hour, value: -30, to: now) else {
            return call.resolve([:])
        }
        let period = HKQuery.predicateForSamples(withStart: windowStart, end: now, options: [])
        let newestFirst = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)

        let query = HKSampleQuery(sampleType: type, predicate: period,
                                  limit: HKObjectQueryNoLimit, sortDescriptors: [newestFirst]) { _, samples, _ in
            guard let samples = samples as? [HKCategorySample], !samples.isEmpty else {
                return DispatchQueue.main.async { call.resolve([:]) }
            }

            let asleepValues: Set<Int> = {
                var values: Set<Int> = [HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue]
                if #available(iOS 16.0, *) {
                    values.formUnion([
                        HKCategoryValueSleepAnalysis.asleepCore.rawValue,
                        HKCategoryValueSleepAnalysis.asleepDeep.rawValue,
                        HKCategoryValueSleepAnalysis.asleepREM.rawValue
                    ])
                }
                return values
            }()
            let inBedValue = HKCategoryValueSleepAnalysis.inBed.rawValue
            let awakeValue = HKCategoryValueSleepAnalysis.awake.rawValue

            let asleep = samples.filter { asleepValues.contains($0.value) }
            let inBed = samples.filter { $0.value == inBedValue }
            let awake = samples.filter { $0.value == awakeValue }

            // Prefer explicit inBed samples; otherwise bound by asleep stages.
            let bedStart = inBed.first?.startDate ?? asleep.first?.startDate
            let bedEnd = (inBed.last?.endDate).map { end in
                max(end, asleep.last?.endDate ?? end)
            } ?? asleep.last?.endDate

            guard let start = bedStart, let end = bedEnd, end > start else {
                return DispatchQueue.main.async { call.resolve([:]) }
            }

            let asleepMinutes = asleep.reduce(0.0) { $0 + $1.endDate.timeIntervalSince($1.startDate) } / 60
            let awakeMinutes = awake.reduce(0.0) { $0 + $1.endDate.timeIntervalSince($1.startDate) } / 60

            let clock = DateFormatter()
            clock.locale = Locale(identifier: "en_US_POSIX")
            clock.dateFormat = "HH:mm"

            var payload: [String: Any] = [
                "inBedStart": clock.string(from: start),
                "inBedEnd": clock.string(from: end)
            ]
            if let firstAsleep = asleep.first?.startDate {
                payload["asleepStart"] = clock.string(from: firstAsleep)
            }
            if asleepMinutes > 0 { payload["asleepMinutes"] = Int(asleepMinutes.rounded()) }
            payload["awakeMinutes"] = Int(awakeMinutes.rounded())

            DispatchQueue.main.async { call.resolve(payload) }
        }
        store.execute(query)
    }

    // MARK: - Cycle

    /// Cycle phase inferred from menstrual flow records. Deliberately coarse:
    /// this is context for the person reading it, not a clinical assessment,
    /// and the app only counts it when they have explicitly opted in.
    @objc func cycleContext(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable(),
              let type = HKObjectType.categoryType(forIdentifier: .menstrualFlow) else {
            return call.resolve([:])
        }

        let now = Date()
        guard let windowStart = Calendar.current.date(byAdding: .day, value: -120, to: now) else {
            return call.resolve([:])
        }
        let period = HKQuery.predicateForSamples(withStart: windowStart, end: now, options: [])
        let newestFirst = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)

        let query = HKSampleQuery(sampleType: type, predicate: period,
                                  limit: HKObjectQueryNoLimit, sortDescriptors: [newestFirst]) { _, samples, _ in
            guard let samples = samples as? [HKCategorySample], !samples.isEmpty else {
                return DispatchQueue.main.async { call.resolve([:]) }
            }

            let unspecified = HKCategoryValueMenstrualFlow.unspecified.rawValue
            let bleeding = samples.filter { $0.value != HKCategoryValueMenstrualFlow.none.rawValue || $0.value == unspecified }
            guard let mostRecent = bleeding.first else {
                return DispatchQueue.main.async { call.resolve([:]) }
            }

            // Walk back to the first day of the current or most recent period.
            var periodStart = mostRecent.startDate
            for sample in bleeding.dropFirst() {
                let gap = Calendar.current.dateComponents([.day], from: sample.startDate, to: periodStart).day ?? 99
                if gap <= 2 { periodStart = sample.startDate } else { break }
            }

            let day = (Calendar.current.dateComponents([.day], from: periodStart, to: now).day ?? 0) + 1
            // A conventional 28-day framing. Real cycles vary; the app says so.
            let phase: String
            switch day {
            case ..<0:     phase = "irregular"
            case 0...5:    phase = "menstrual"
            case 6...11:   phase = "follicular"
            case 12...16:  phase = "ovulatory"
            case 17...33:  phase = "luteal"
            default:       phase = "irregular"
            }

            DispatchQueue.main.async {
                call.resolve(["phase": phase, "dayOfCycle": day])
            }
        }
        store.execute(query)
    }
}
