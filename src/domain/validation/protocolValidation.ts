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
  });

  return errors;
}
