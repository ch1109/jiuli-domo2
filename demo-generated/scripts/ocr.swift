import Foundation
import Vision
import AppKit
for path in CommandLine.arguments.dropFirst() {
  do {
    let req = VNRecognizeTextRequest()
    req.recognitionLevel = .accurate
    req.recognitionLanguages = ["zh-Hans", "zh-Hant", "en-US"]
    req.usesLanguageCorrection = false
    let handler = VNImageRequestHandler(url: URL(fileURLWithPath: path))
    try handler.perform([req])
    let rows: [[String: Any]] = (req.results ?? []).compactMap { observation in
      guard let t = observation.topCandidates(1).first else {return nil}
      let b = observation.boundingBox
      return ["text":t.string,"confidence":t.confidence,"box":[b.minX,1-b.maxY,b.width,b.height]]
    }
    let data = try JSONSerialization.data(withJSONObject: ["path":path,"observations":rows],options:[.sortedKeys])
    print(String(data:data,encoding:.utf8)!)
  } catch {
    let data = try! JSONSerialization.data(withJSONObject:["path":path,"error":String(describing:error)])
    print(String(data:data,encoding:.utf8)!)
  }
}
