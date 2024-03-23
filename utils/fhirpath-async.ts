import type { CodeableConcept, Coding, OperationOutcome, OperationOutcomeIssue } from "fhir/r4b";
import fhirpath from "fhirpath";
import { logMessage, CreateOperationOutcome } from "~/utils/create-outcome";

// --------------------------------------------------------------------------
// The concept of this POC is to demonstrate an approach to perform some
// async based methods as functions inside the fhirpath engine without
// converting the entire engine to process things asynchronously.
// e.g. Terminology functions such as memberOf, subsumes, or resolve()
//
// The basic gist is:
// * Perform an initial evaluation in sync mode
// * when encountering any method that requires async execution
//    - queue the required call
//    - return a null result
//    - continue processing the rest of the expression.
// * If no async calls where encountered the result is returned immediately.
// * Process all the encountered async calls and stash the results.
// * Re-evaluate the expression from the start
//    - when encountering the async methods again, inject the resolved results and continue processing.
// If there were no additional async methods encountered, return the result.
// otherwise, repeat the process until all async calls are resolved.
// --------------------------------------------------------------------------


export var debugAsyncFhirpath: boolean = true;

export async function evaluateFhirpathAsync(
  fhirData: fhir4b.DomainResource,
  path: string | Path,
  context?: Context,
  model?: Model,
): Promise<any[]> {
  var results = [];
  var debug = false;
  var outcome: OperationOutcome = {
    resourceType: "OperationOutcome",
    issue: []
  }

  var memberOfCallsRequired: Map<string, boolean | undefined> = new Map<string, boolean>();
  var requiresAsyncProcessing = false;
  // introduce a custom function for resolve into the options
  // https://github.com/HL7/fhirpath.js/?tab=readme-ov-file#user-defined-functions
  // https://github.com/HL7/fhirpath.js/blob/5428ef8be766301658215ef7ed241c8a1666a980/index.d.ts#L86
  const userInvocationTable: UserInvocationTable = {
    memberOf: {
      fn: (inputs: any[], valueset: string) =>
        inputs.map((codeData: string | Coding | CodeableConcept) => {
          const key = createIndexKeyMemberOf(codeData, valueset);
          if (key) {
            if (memberOfCallsRequired.has(key) && memberOfCallsRequired.get(key) !== undefined) {
              logMessage(debugAsyncFhirpath, outcome, '  using cached result for: ', key);
              return memberOfCallsRequired.get(key);
            }
            memberOfCallsRequired.set(key, undefined);
            logMessage(debugAsyncFhirpath, outcome, '  requires async evaluation for: ', key);
            requiresAsyncProcessing = true;
          }
          return undefined;
        }),
      arity: { 1: ["String"] },
    },
  };

  let options = {
    userInvocationTable: userInvocationTable,
  };

  let iterations = 0;
  do {
    iterations++;
    // Perform the async calls required (none first time in)
    if (memberOfCallsRequired.size > 0) {
      // resolve the async calls
      for (let key of memberOfCallsRequired.keys()) {
        if (memberOfCallsRequired.get(key) === undefined) {
          // perform the async call to check for the memberOf status
          logMessage(debugAsyncFhirpath, outcome, "  performing async request for: ", key);
          if (key === "http://terminology.hl7.org/CodeSystem/v3-MaritalStatus|M - http://hl7.org/fhir/ValueSet/observation-vitalsignresult")
            memberOfCallsRequired.set(key, true);
          else
            memberOfCallsRequired.set(key, false);
        }
      }
      requiresAsyncProcessing = false;
    }

    // Evaluate the expression
    logMessage(debugAsyncFhirpath, outcome, "performing iteration: ", iterations)
    try {
      results = fhirpath.evaluate(
        fhirData,
        path,
        context,
        model,
        options
      );
    } catch (err: any) {
      console.log(err);
      if (err.message) {
        throw CreateOperationOutcome("fatal", "exception", err.message);
      }
    }

  } while (requiresAsyncProcessing && iterations < 10); // bound the number of iterations
  if (iterations > 1) {
    logMessage(debugAsyncFhirpath, outcome, "total iterations", iterations);
  }
  console.log(outcome);
  return results;
}

interface AsyncFunctionUserData {
  evaluationCompleted: boolean;
  result?: any;
}
interface MemberOfUserData extends AsyncFunctionUserData {
  value: string | Coding | CodeableConcept;
  valueset: string;
}

/**
 * Create an Index Key for the memberOf function
 * @param value 
 * @param valueset 
 * @returns 
 */
function createIndexKeyMemberOf(value: string | Coding | CodeableConcept, valueset: string): string | undefined {
  if (typeof value === "string") {
    return value + " - " + valueset;
  }
  let coding = value as Coding;
  if (coding.code) {
    return coding.system + "|" + coding.code + " - " + valueset;
  }
  let cc = value as CodeableConcept;
  if (cc.coding) {
    // return the same as for coding by joining each of the codings with a comma
    return cc.coding.map((c) => c.system + "|" + c.code).join(",") + " - " + valueset;
  }
  return undefined;
}

async function memberOfAsync(value: string | Coding | CodeableConcept, valueset: string): Promise<boolean> {
  // perform the async call to check for the memberOf status
  return true;
}
