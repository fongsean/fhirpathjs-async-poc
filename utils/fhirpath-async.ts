import type { CodeableConcept, Coding } from "fhir/r4b";
import fhirpath from "fhirpath";
// import { Coding, OperationOutcomeIssue } from "fhir/r4b";
import fhirpath_r4_model from "fhirpath/fhir-context/r4";
import { CreateOperationOutcome } from "~/utils/create-outcome";

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

function createIndexKey(value: string | Coding | CodeableConcept) {
  if (typeof value === "string") {
    return value;
  }
  if (value.code) {
    return value.system + "|" + value.code;
  }
  if (value.coding) {
    return value.coding[0].system + "|" + value.coding[0].code;
  }
  return "";
}

export async function evaluateFhirpathAsync(
  resourceJson: string,
  expression: string
): Promise<any[]> {
  var results = [];

  // run the actual fhirpath engine
  let fhirData: fhir4b.DomainResource = { resourceType: "Patient" }; // some dummy data
  if (resourceJson) {
    try {
      fhirData = JSON.parse(resourceJson);
    } catch (err: any) {
      console.log(err);
      if (err.message) {
        throw CreateOperationOutcome("fatal", "exception", err.message);
      }
    }
  }
  var environment: Record<string, any> = {
    resource: fhirData,
    rootResource: fhirData,
  };

  let iterations = 0;
  var memberOfCallsRequired: Map<string, boolean | undefined> = new Map<string, boolean>();
  var requiresAsyncProcessing = false;
  // introduce a custom function for resolve into the options
  // https://github.com/HL7/fhirpath.js/?tab=readme-ov-file#user-defined-functions
  // https://github.com/HL7/fhirpath.js/blob/5428ef8be766301658215ef7ed241c8a1666a980/index.d.ts#L86
  const userInvocationTable: UserInvocationTable = {
    memberOf: {
      fn: (inputs: any[], valueset: string) =>
        inputs.map((i: string | Coding | CodeableConcept) => {
          const key = createIndexKey(i) + " - " + valueset;
          if (memberOfCallsRequired.has(key) && memberOfCallsRequired.get(key) !== undefined) {
            console.log('  using cached result for: ', key);
            return memberOfCallsRequired.get(key);
          }
          memberOfCallsRequired.set(key, undefined);
          console.log('  requires evaluation for: ', key);
          requiresAsyncProcessing = true;
          return undefined;
        }),
      arity: { 1: ["String"] },
    },
  };

  let options = {
    userInvocationTable: userInvocationTable,
  };

  do {
    iterations++;
    // Perform the async calls required (none first time in)
    if (memberOfCallsRequired.size > 0) {
      // resolve the async calls
      for (let key of memberOfCallsRequired.keys()) {
        if (memberOfCallsRequired.get(key) === undefined){
          // perform the async call to check for the memberOf status
          console.log("  performing async request for: ", key);
          memberOfCallsRequired.set(key, true);
        }
      }
      requiresAsyncProcessing = false;
    }

    // Evaluate the expression
    console.log("performing iteration: ", iterations)
    try {
      results = fhirpath.evaluate(
        fhirData,
        expression,
        environment,
        fhirpath_r4_model,
        options
      );
      console.log("memberOf Calls Required: ", memberOfCallsRequired);
    } catch (err: any) {
      console.log(err);
      if (err.message) {
        throw CreateOperationOutcome("fatal", "exception", err.message);
      }
    }

  } while (requiresAsyncProcessing && iterations < 10); // bound the number of iterations
  if (iterations > 1) {
    console.log("iterations", iterations);
  }
  return results;
}
