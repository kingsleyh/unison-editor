use anyhow::{Context, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};

// Internal struct for deserializing from UCM API
#[derive(Debug, Clone, Deserialize)]
struct ProjectResponse {
    #[serde(rename = "projectName")]
    project_name: String,
    #[serde(rename = "activeBranchRef")]
    active_branch_ref: Option<String>,
}

// Public struct for sending to frontend
#[derive(Debug, Clone, Serialize)]
pub struct Project {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_branch: Option<String>,
}

impl From<ProjectResponse> for Project {
    fn from(resp: ProjectResponse) -> Self {
        Project {
            name: resp.project_name,
            active_branch: resp.active_branch_ref,
        }
    }
}

// Internal struct for deserializing from UCM API
#[derive(Debug, Clone, Deserialize)]
struct BranchResponse {
    #[serde(rename = "branchName")]
    branch_name: String,
}

// Public struct for sending to frontend
#[derive(Debug, Clone, Serialize)]
pub struct Branch {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project: Option<String>,
}

impl From<BranchResponse> for Branch {
    fn from(resp: BranchResponse) -> Self {
        Branch {
            name: resp.branch_name,
            project: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Definition {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hash: Option<String>,
    #[serde(rename = "type")]
    pub def_type: String,
}

// Internal structs for deserializing UCM API namespace listing response
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "tag", content = "contents")]
enum NamespaceChild {
    Subnamespace {
        #[serde(rename = "namespaceHash")]
        namespace_hash: String,
        #[serde(rename = "namespaceName")]
        namespace_name: String,
        #[serde(rename = "namespaceSize")]
        _namespace_size: usize,
    },
    TermObject {
        #[serde(rename = "termHash")]
        term_hash: String,
        #[serde(rename = "termName")]
        term_name: String,
        #[serde(rename = "termTag")]
        _term_tag: String,
        #[serde(rename = "termType")]
        _term_type: serde_json::Value, // Can be complex, we don't need it
    },
    TypeObject {
        #[serde(rename = "typeHash")]
        type_hash: String,
        #[serde(rename = "typeName")]
        type_name: String,
    },
    PatchObject {
        #[serde(rename = "patchHash")]
        patch_hash: String,
        #[serde(rename = "patchName")]
        patch_name: String,
    },
}

#[derive(Debug, Clone, Deserialize)]
struct NamespaceListingResponse {
    #[serde(rename = "namespaceListingChildren")]
    namespace_listing_children: Vec<NamespaceChild>,
    #[serde(rename = "namespaceListingFQN")]
    _namespace_listing_fqn: String,
    #[serde(rename = "namespaceListingHash")]
    _namespace_listing_hash: String,
}

// Public struct for sending to frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NamespaceItem {
    pub name: String,
    #[serde(rename = "type")]
    pub item_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hash: Option<String>,
}

impl From<NamespaceChild> for NamespaceItem {
    fn from(child: NamespaceChild) -> Self {
        match child {
            NamespaceChild::Subnamespace {
                namespace_hash,
                namespace_name,
                ..
            } => NamespaceItem {
                name: namespace_name,
                item_type: "namespace".to_string(),
                hash: Some(namespace_hash),
            },
            NamespaceChild::TermObject {
                term_hash,
                term_name,
                ..
            } => NamespaceItem {
                name: term_name,
                item_type: "term".to_string(),
                hash: Some(term_hash),
            },
            NamespaceChild::TypeObject {
                type_hash,
                type_name,
            } => NamespaceItem {
                name: type_name,
                item_type: "type".to_string(),
                hash: Some(type_hash),
            },
            NamespaceChild::PatchObject {
                patch_hash,
                patch_name,
            } => NamespaceItem {
                name: patch_name,
                item_type: "patch".to_string(),
                hash: Some(patch_hash),
            },
        }
    }
}

// Response from UCM getDefinition endpoint
#[derive(Debug, Clone, Deserialize)]
struct GetDefinitionResponse {
    #[serde(rename = "termDefinitions")]
    term_definitions: std::collections::HashMap<String, TermDefinitionDetail>,
    #[serde(rename = "typeDefinitions")]
    type_definitions: std::collections::HashMap<String, TypeDefinitionDetail>,
    #[serde(rename = "missingDefinitions")]
    _missing_definitions: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct TermDefinitionDetail {
    #[serde(rename = "bestTermName")]
    best_term_name: String,
    #[serde(rename = "termDefinition")]
    term_definition: TermDefinitionSource,
    #[serde(rename = "signature")]
    signature: Vec<serde_json::Value>, // Array of signature elements
    #[serde(rename = "termDocs")]
    #[serde(default)]
    term_docs: Option<serde_json::Value>, // Doc AST if available
    #[serde(rename = "termTag")]
    #[serde(default)]
    term_tag: Option<String>, // "Plain", "Test", or "Doc"
}

#[derive(Debug, Clone, Deserialize)]
struct TermDefinitionSource {
    #[serde(rename = "contents")]
    contents: Vec<SourceSegment>, // Array of annotated segments
}

#[derive(Debug, Clone, Deserialize)]
struct TypeDefinitionDetail {
    #[serde(rename = "bestTypeName")]
    best_type_name: String,
    #[serde(rename = "typeDefinition")]
    type_definition: TypeDefinitionSource,
}

#[derive(Debug, Clone, Deserialize)]
struct TypeDefinitionSource {
    #[serde(rename = "contents")]
    contents: Vec<SourceSegment>, // Array of annotated segments
}

// Source segment with annotation metadata from UCM
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceSegment {
    pub segment: String,
    #[serde(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub annotation: Option<serde_json::Value>,
}

// Public struct for definition summary
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DefinitionSummary {
    pub name: String,
    pub hash: String,
    #[serde(rename = "type")]
    pub def_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signature: Option<String>,
    // Deprecated: kept for backwards compatibility but will be empty
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    // New: annotated source segments for rich rendering
    pub segments: Vec<SourceSegment>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub documentation: Option<String>,
    // Doc AST for Doc terms - this is the parsed Doc literal structure
    #[serde(skip_serializing_if = "Option::is_none")]
    pub doc: Option<serde_json::Value>,
    // Term tag: "Plain", "Test", or "Doc"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tag: Option<String>,
}

// Internal structs for deserializing from UCM API search response
#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
struct SearchResultScore {
    result: SearchResultMatch,
    score: i32,
}

#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
struct SearchResultMatch {
    segments: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "tag", content = "contents")]
#[allow(dead_code)]
enum SearchResultItem {
    FoundTermResult {
        #[serde(rename = "bestFoundTermName")]
        best_found_term_name: String,
        #[serde(rename = "namedTerm")]
        named_term: NamedTermSearchResult,
    },
    FoundTypeResult {
        #[serde(rename = "bestFoundTypeName")]
        best_found_type_name: String,
        #[serde(rename = "namedType")]
        named_type: NamedTypeSearchResult,
        #[serde(rename = "typeDef")]
        _type_def: serde_json::Value,
    },
}

#[derive(Debug, Clone, Deserialize)]
struct NamedTermSearchResult {
    #[serde(rename = "termHash")]
    term_hash: String,
    #[serde(rename = "termName")]
    term_name: String,
    #[serde(rename = "termTag")]
    _term_tag: String,
    #[serde(rename = "termType")]
    _term_type: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Deserialize)]
struct NamedTypeSearchResult {
    #[serde(rename = "typeHash")]
    type_hash: String,
    #[serde(rename = "typeName")]
    type_name: String,
    #[serde(rename = "typeTag")]
    _type_tag: String,
}

// Public struct for sending to frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub name: String,
    #[serde(rename = "type")]
    pub result_type: String,
    pub hash: String,
}

// Internal struct for deserializing from UCM API
// UCM returns flat strings: {"project": "validation", "branch": "main", "path": "."}
#[derive(Debug, Clone, Deserialize)]
struct CurrentContextResponse {
    pub project: Option<String>,
    pub branch: Option<String>,
    pub path: String,
}

// Public struct for sending to frontend
#[derive(Debug, Clone, Serialize)]
pub struct CurrentContext {
    pub project: Option<Project>,
    pub branch: Option<Branch>,
    pub path: String,
}

impl From<CurrentContextResponse> for CurrentContext {
    fn from(resp: CurrentContextResponse) -> Self {
        CurrentContext {
            project: resp.project.map(|name| Project {
                name,
                active_branch: None,
            }),
            branch: resp.branch.map(|name| Branch {
                name,
                project: None,
            }),
            path: resp.path,
        }
    }
}

#[derive(Clone)]
pub struct UCMApiClient {
    client: Client,
    base_url: String,
}

impl UCMApiClient {
    pub fn new(host: &str, port: u16) -> Self {
        Self {
            client: Client::new(),
            base_url: format!("http://{}:{}/codebase/api", host, port),
        }
    }

    pub async fn get_projects(&self) -> Result<Vec<Project>> {
        let url = format!("{}/projects", self.base_url);
        let response = self
            .client
            .get(&url)
            .send()
            .await
            .context("Failed to send request to UCM")?;

        if !response.status().is_success() {
            anyhow::bail!("UCM API error: {}", response.status());
        }

        let projects_response = response
            .json::<Vec<ProjectResponse>>()
            .await
            .context("Failed to parse projects response")?;

        Ok(projects_response.into_iter().map(Project::from).collect())
    }

    pub async fn get_branches(&self, project_name: &str) -> Result<Vec<Branch>> {
        let url = format!("{}/projects/{}/branches", self.base_url, project_name);
        let response = self
            .client
            .get(&url)
            .send()
            .await
            .context("Failed to get branches")?;

        if !response.status().is_success() {
            anyhow::bail!("UCM API error: {}", response.status());
        }

        let branches_response = response
            .json::<Vec<BranchResponse>>()
            .await
            .context("Failed to parse branches response")?;

        Ok(branches_response.into_iter().map(Branch::from).collect())
    }

    pub async fn get_current_context(&self) -> Result<CurrentContext> {
        let url = format!("{}/ucm/current", self.base_url);
        let response = self
            .client
            .get(&url)
            .send()
            .await
            .context("Failed to get current context")?;

        if !response.status().is_success() {
            anyhow::bail!("UCM API error: {}", response.status());
        }

        let context_response = response
            .json::<CurrentContextResponse>()
            .await
            .context("Failed to parse current context")?;

        Ok(CurrentContext::from(context_response))
    }

    pub async fn list_namespace(
        &self,
        project_name: &str,
        branch_name: &str,
        namespace: &str,
    ) -> Result<Vec<NamespaceItem>> {
        let url = format!(
            "{}/projects/{}/branches/{}/list",
            self.base_url, project_name, branch_name
        );

        // Build request - only add namespace parameter if it's not empty and not "."
        let mut request = self.client.get(&url);
        if !namespace.is_empty() && namespace != "." {
            request = request.query(&[("namespace", namespace)]);
        }

        let response = request
            .send()
            .await
            .context("Failed to list namespace")?;

        if !response.status().is_success() {
            anyhow::bail!("UCM API error: {}", response.status());
        }

        // Get response text for debugging
        let response_text = response.text().await.context("Failed to read response text")?;

        let listing_response: NamespaceListingResponse = serde_json::from_str(&response_text)
            .context(format!("Failed to parse namespace listing. Response was: {}", response_text))?;

        Ok(listing_response
            .namespace_listing_children
            .into_iter()
            .map(NamespaceItem::from)
            .collect())
    }

    pub async fn get_definition(
        &self,
        project_name: &str,
        branch_name: &str,
        name: &str,
        suffixify_bindings: bool,
    ) -> Result<Option<DefinitionSummary>> {
        let url = format!(
            "{}/projects/{}/branches/{}/getDefinition",
            self.base_url, project_name, branch_name
        );

        // UCM expects names as a query parameter (not names[])
        // Names can be fully qualified names (e.g. "base.List.map") or hashes (e.g. "#abc123...")
        // suffixifyBindings controls whether names in the source are fully qualified (false) or shortened (true)
        let response = self
            .client
            .get(&url)
            .query(&[
                ("names", name),
                ("suffixifyBindings", if suffixify_bindings { "true" } else { "false" }),
            ])
            .send()
            .await
            .context("Failed to get definition")?;

        if !response.status().is_success() {
            if response.status() == 404 {
                return Ok(None);
            }
            anyhow::bail!("UCM API error: {}", response.status());
        }

        let def_response = response
            .json::<GetDefinitionResponse>()
            .await
            .context("Failed to parse definition response")?;

        // Try to extract from termDefinitions first
        if let Some((hash, term_detail)) = def_response.term_definitions.iter().next() {
            // Clone the annotated segments for rich rendering
            let segments = term_detail.term_definition.contents.clone();

            // Extract signature from the signature array
            // The signature array contains segment objects with { segment: "...", annotation: ... }
            let signature: Option<String> = if !term_detail.signature.is_empty() {
                let sig_text: String = term_detail
                    .signature
                    .iter()
                    .filter_map(|seg| seg.get("segment").and_then(|s| s.as_str()))
                    .collect();
                if sig_text.is_empty() {
                    None
                } else {
                    Some(sig_text)
                }
            } else {
                None
            };

            log::debug!(
                "get_definition returning: name={}, hash={}, segments_len={}, signature={:?}",
                term_detail.best_term_name,
                hash,
                segments.len(),
                signature
            );

            return Ok(Some(DefinitionSummary {
                name: term_detail.best_term_name.clone(),
                hash: hash.clone(),
                def_type: "term".to_string(),
                signature,
                source: None,
                segments,
                documentation: None,
                doc: term_detail.term_docs.clone(),
                tag: term_detail.term_tag.clone(),
            }));
        }

        // Then try typeDefinitions
        if let Some((hash, type_detail)) = def_response.type_definitions.iter().next() {
            // Clone the annotated segments for rich rendering
            let segments = type_detail.type_definition.contents.clone();

            return Ok(Some(DefinitionSummary {
                name: type_detail.best_type_name.clone(),
                hash: hash.clone(),
                def_type: "type".to_string(),
                signature: None,
                source: None,
                segments,
                documentation: None,
                doc: None,
                tag: None,
            }));
        }

        // No definition found
        Ok(None)
    }

    pub async fn find_definitions(
        &self,
        project_name: &str,
        branch_name: &str,
        query: &str,
        limit: usize,
    ) -> Result<Vec<SearchResult>> {
        let url = format!(
            "{}/projects/{}/branches/{}/find",
            self.base_url, project_name, branch_name
        );
        let response = self
            .client
            .get(&url)
            .query(&[("query", query), ("limit", &limit.to_string())])
            .send()
            .await
            .context("Failed to search definitions")?;

        if !response.status().is_success() {
            anyhow::bail!("UCM API error: {}", response.status());
        }

        // Parse as array of [score_info, result_item] tuples
        let raw_results = response
            .json::<Vec<(SearchResultScore, SearchResultItem)>>()
            .await
            .context("Failed to parse search results")?;

        // Convert to our simplified SearchResult format
        // Use the full termName/typeName from namedTerm/namedType for FQN resolution
        let results: Vec<SearchResult> = raw_results
            .into_iter()
            .map(|(_score, item)| match item {
                SearchResultItem::FoundTermResult {
                    best_found_term_name: _,
                    named_term,
                } => SearchResult {
                    // Use term_name (FQN like "common.auth.authenticateRemote") not best_found_term_name (short name)
                    name: named_term.term_name,
                    result_type: "term".to_string(),
                    hash: named_term.term_hash,
                },
                SearchResultItem::FoundTypeResult {
                    best_found_type_name: _,
                    named_type,
                    ..
                } => SearchResult {
                    // Use type_name (FQN) not best_found_type_name (short name)
                    name: named_type.type_name,
                    result_type: "type".to_string(),
                    hash: named_type.type_hash,
                },
            })
            .collect();

        Ok(results)
    }

    pub async fn get_dependencies(
        &self,
        project_name: &str,
        branch_name: &str,
        name: &str,
    ) -> Result<Vec<Definition>> {
        let url = format!(
            "{}/projects/{}/branches/{}/getDefinitionDependencies",
            self.base_url, project_name, branch_name
        );
        let response = self
            .client
            .get(&url)
            .query(&[("name", name)])
            .send()
            .await
            .context("Failed to get dependencies")?;

        if !response.status().is_success() {
            anyhow::bail!("UCM API error: {}", response.status());
        }

        let deps = response
            .json::<Vec<Definition>>()
            .await
            .context("Failed to parse dependencies")?;

        Ok(deps)
    }

    pub async fn get_dependents(
        &self,
        project_name: &str,
        branch_name: &str,
        name: &str,
    ) -> Result<Vec<Definition>> {
        let url = format!(
            "{}/projects/{}/branches/{}/getDefinitionDependents",
            self.base_url, project_name, branch_name
        );
        let response = self
            .client
            .get(&url)
            .query(&[("name", name)])
            .send()
            .await
            .context("Failed to get dependents")?;

        if !response.status().is_success() {
            anyhow::bail!("UCM API error: {}", response.status());
        }

        let deps = response
            .json::<Vec<Definition>>()
            .await
            .context("Failed to parse dependents")?;

        Ok(deps)
    }

    pub async fn check_connection(&self) -> Result<bool> {
        let url = format!("{}/projects", self.base_url);
        match self.client.get(&url).send().await {
            Ok(response) => Ok(response.status().is_success()),
            Err(_) => Ok(false),
        }
    }
}
