/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
use std::collections::HashMap;

use crate::options::Quality;
use serde::{Deserialize, Serialize};

#[derive(Deserialize, Debug)]
#[serde(tag = "method", content = "params")]
#[allow(non_camel_case_types)]
pub enum ServerRequestMethod {
    serve(ServeParams),
    prune,
    ping(EmptyResult),
    forward(ForwardParams),
    unforward(UnforwardParams),
    gethostname(EmptyResult),
    update(UpdateParams),
    servermsg(ServerMessageParams),
    callserverhttp(CallServerHttpParams),
}

#[derive(Serialize, Debug)]
#[serde(tag = "method", content = "params", rename_all = "camelCase")]
#[allow(non_camel_case_types)]
pub enum ClientRequestMethod<'a> {
    servermsg(RefServerMessageParams<'a>),
    serverlog(ServerLog<'a>),
    version(VersionParams),
}

#[derive(Deserialize, Debug)]
pub struct ForwardParams {
    pub port: u16,
}

#[derive(Deserialize, Debug)]
pub struct UnforwardParams {
    pub port: u16,
}

#[derive(Serialize)]
pub struct ForwardResult {
    pub uri: String,
}

#[derive(Deserialize, Debug)]
pub struct ServeParams {
    pub socket_id: u16,
    pub commit_id: Option<String>,
    pub quality: Quality,
    pub extensions: Vec<String>,
}

#[derive(Deserialize, Serialize, Debug)]
pub struct EmptyResult {}

#[derive(Serialize, Deserialize, Debug)]
pub struct UpdateParams {
    pub do_update: bool,
}

#[derive(Deserialize, Debug)]
pub struct ServerMessageParams {
    pub i: u16,
    #[serde(with = "serde_bytes")]
    pub body: Vec<u8>,
}

#[derive(Serialize, Debug)]
pub struct RefServerMessageParams<'a> {
    pub i: u16,
    #[serde(with = "serde_bytes")]
    pub body: &'a [u8],
}

#[derive(Serialize)]
pub struct UpdateResult {
    pub up_to_date: bool,
    pub did_update: bool,
}

#[derive(Deserialize, Debug)]
pub struct ToServerRequest {
    pub id: Option<u8>,
    #[serde(flatten)]
    pub params: ServerRequestMethod,
}

#[derive(Serialize, Debug)]
pub struct ToClientRequest<'a> {
    pub id: Option<u8>,
    #[serde(flatten)]
    pub params: ClientRequestMethod<'a>,
}

#[derive(Serialize, Deserialize)]
pub struct SuccessResponse<T>
where
    T: Serialize,
{
    pub id: u8,
    pub result: T,
}

#[derive(Serialize, Deserialize)]
pub struct ErrorResponse {
    pub id: u8,
    pub error: ResponseError,
}

#[derive(Serialize, Deserialize)]
pub struct ResponseError {
    pub code: i32,
    pub message: String,
}

#[derive(Debug, Default, Serialize)]
pub struct ServerLog<'a> {
    pub line: &'a str,
    pub level: u8,
}

#[derive(Serialize)]
pub struct GetHostnameResponse {
    pub value: String,
}

#[derive(Deserialize, Debug)]
pub struct CallServerHttpParams {
    pub path: String,
    pub method: String,
    pub headers: HashMap<String, String>,
    pub body: Option<Vec<u8>>,
}

#[derive(Serialize)]
pub struct CallServerHttpResult {
    pub status: u16,
    #[serde(with = "serde_bytes")]
    pub body: Vec<u8>,
    pub headers: HashMap<String, String>,
}

#[derive(Serialize, Debug)]
pub struct VersionParams {
    pub version: &'static str,
    pub protocol_version: u32,
}
