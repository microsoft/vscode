/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
use std::path::Path;

use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{unix::OwnedWriteHalf, UnixStream},
    sync::mpsc::Sender,
};

use crate::util::errors::{wrap, AnyError};

pub struct ServerBridge {
    write: OwnedWriteHalf,
}

pub trait FromServerMessage {
    fn from_server_message(index: u16, message: &[u8]) -> Self;
    fn from_closed_server_bridge(i: u16) -> Self;
}

pub async fn get_socket_rw_stream(path: &Path) -> Result<UnixStream, AnyError> {
    let s = UnixStream::connect(path).await.map_err(|e| {
        wrap(
            e,
            format!(
                "error connecting to vscode server socket in {}",
                path.display()
            ),
        )
    })?;

    Ok(s)
}

const BUFFER_SIZE: usize = 65536;

impl ServerBridge {
    pub async fn new<T>(path: &Path, index: u16, target: &Sender<T>) -> Result<Self, AnyError>
    where
        T: 'static + FromServerMessage + Send,
    {
        let stream = get_socket_rw_stream(path).await?;
        let (mut read, write) = stream.into_split();

        let tx = target.clone();
        tokio::spawn(async move {
            let mut read_buf = vec![0; BUFFER_SIZE];
            loop {
                match read.read(&mut read_buf).await {
                    Err(_) => return,
                    Ok(0) => {
                        let _ = tx.send(T::from_closed_server_bridge(index)).await;
                        return; // EOF
                    }
                    Ok(s) => {
                        let send = tx.send(T::from_server_message(index, &read_buf[..s])).await;
                        if send.is_err() {
                            return;
                        }
                    }
                }
            }
        });

        Ok(ServerBridge { write })
    }

    pub async fn write(&mut self, b: Vec<u8>) -> std::io::Result<()> {
        self.write.write_all(&b).await?;
        Ok(())
    }

    pub async fn close(mut self) -> std::io::Result<()> {
        self.write.shutdown().await?;
        Ok(())
    }
}
