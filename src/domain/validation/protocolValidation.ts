import { Protocol } from "../types";

export interface ProtocolValidationError {
  segmentId?: string;
  message: string;
}

export function validateProtocol(protocol: Protocol): ProtocolValidationError[] {
  const errors: ProtocolValidationError[] = [];

  if (!protocol.title || protocol.title.trim() === '') {
    errors.push({ message: "Protocol must have a title." });
  }

  if (protocol.segments.length === 0) {
    errors.push({ message: "Protocol must have at least one segment." });
    return errors;
  }

  protocol.segments.forEach(segment => {
    if (segment.durationSeconds <= 0) {
      errors.push({ segmentId: segment.segmentId, message: "Segment duration must be greater than 0." });
    }
    
    if (segment.repeatCount <= 0) {
      errors.push({ segmentId: segment.segmentId, message: "Segment repeat count must be at least 1." });
    }

    if (segment.phase === "WORK" && segment.exerciseSlotCount < 1) {
      errors.push({ segmentId: segment.segmentId, message: "Work segments must have at least 1 exercise slot." });
    }
    if (segment.phase !== "WORK" && segment.exerciseSlotCount !== 0) {
      errors.push({ segmentId: segment.segmentId, message: "Only work segments may define exercise slots." });
    }
    segment.targets.forEach(target => {
      if (!target.metricKey || !target.canonicalUnit) errors.push({ segmentId: segment.segmentId, message: "Targets require a metric and canonical unit." });
      if (target.minimumValue !== undefined && target.maximumValue !== undefined && target.minimumValue > target.maximumValue) {
        errors.push({ segmentId: segment.segmentId, message: "Target minimum cannot exceed maximum." });
      }
      if (target.targetValue !== undefined && target.minimumValue !== undefined && target.targetValue < target.minimumValue) errors.push({ segmentId: segment.segmentId, message: "Target value cannot be below minimum." });
      if (target.targetValue !== undefined && target.maximumValue !== undefined && target.targetValue > target.maximumValue) errors.push({ segmentId: segment.segmentId, message: "Target value cannot exceed maximum." });
    });
  });

  return errors;
}
