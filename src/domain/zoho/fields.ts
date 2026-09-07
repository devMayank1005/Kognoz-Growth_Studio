/**
 * The constants that are a data contract with the client's CRM.
 *
 * Everything here is written INTO someone else's Zoho, so each value is a
 * commitment: change one and existing records stop matching. They live in one
 * module so the API path and the CSV fallback cannot drift — the prototype had
 * its Lead Source typed out four separate times.
 */

/**
 * PRD §6. The prototype writes "Growth Engine", which is the product's
 * pre-rename name; CLAUDE.md's tie-break is "the PRD wins on scope", and a
 * picklist value written into a client's CRM is scope, not behaviour.
 *
 * This must exist as a `Lead_Source` picklist option in the target org or the
 * first write fails with INVALID_DATA. `settings.zohoLeadSource` overrides it
 * for a client who will not add a new option.
 */
export const LEAD_SOURCE = "Growth Studio";

/**
 * The ONLY fields the reconcile may read back and keep (PRD §6: "pull
 * stage/amount changes hourly").
 *
 * Deliberately short. Zoho Deals carry dozens of fields and Contacts carry
 * `Email`, `Phone` and `Mobile`; every name added here is a name a future bug
 * can mis-map, so `Closing_Date` is excluded even though we write it — §6 says
 * stage and amount, and nothing else has a reason to come back.
 */
export const PULLED_DEAL_FIELDS = ["id", "Stage", "Amount", "Modified_Time"] as const;

/** The `fields=` query parameter, so personal data never crosses the network. */
export const PULLED_DEAL_FIELDS_PARAM = PULLED_DEAL_FIELDS.join(",");

/** Zoho caps Deal_Name. VERIFY against the API docs before the first push. */
export const DEAL_NAME_MAX = 120;

/** PRD §6: "Closing Date = due or +90d". */
export const DEFAULT_CLOSE_DAYS = 90;

/**
 * `Last_Name` is mandatory on Zoho Leads, but PRD §6 permits a name only from a
 * verified contact. An unnamed prospect therefore needs a placeholder.
 *
 * Deliberate and greppable rather than accidental, so the client can filter it
 * out of their own views — and so that if lead conversion creates a Contact
 * from it, the junk is at least identifiable. See the plan's open question 2:
 * if Zoho's convert API can suppress contact creation, this stops mattering.
 */
export const NO_NAMED_CONTACT = "(no named contact)";
