/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use serde::Serialize;
use tokio::sync::mpsc;

use crate::msgpack_rpc::MsgPackCaller;

use super::{
	protocol::{ClientRequestMethod, RefServerMessageParams, ServerClosedParams, ToClientRequest},
	server_multiplexer::ServerMultiplexer,
};

pub struct CloseReason(pub String);

pub enum SocketSignal {
	/// Signals bytes to send to the socket.
	Send(Vec<u8>),
	/// Closes the socket (e.g. as a result of an error)
	CloseWith(CloseReason),
}

impl From<Vec<u8>> for SocketSignal {
	fn from(v: Vec<u8>) -> Self {
		SocketSignal::Send(v)
	}
}

impl SocketSignal {
	pub fn from_message<T>(msg: &T) -> Self
	where
		T: Serialize + ?Sized,
	{
		SocketSignal::Send(rmp_serde::to_vec_named(msg).unwrap())
	}
}

/// todo@connor4312: cleanup once everything is moved to rpc standard interfaces
#[allow(dead_code)]
pub enum ServerMessageDestination {
	Channel(mpsc::Sender<SocketSignal>),
	Rpc(MsgPackCaller),
}

/// Struct that handling sending or closing a connected server socket.
pub struct ServerMessageSink {
	id: u16,
	tx: Option<ServerMessageDestination>,
	multiplexer: ServerMultiplexer,
	flate: Option<FlateStream<CompressFlateAlgorithm>>,
}

impl ServerMessageSink {
	pub fn new_plain(
		multiplexer: ServerMultiplexer,
		id: u16,
		tx: ServerMessageDestination,
	) -> Self {
		Self {
			tx: Some(tx),
			id,
			multiplexer,
			flate: None,
		}
	}

	pub fn new_compressed(
		multiplexer: ServerMultiplexer,
		id: u16,
		tx: ServerMessageDestination,
	) -> Self {
		Self {
			tx: Some(tx),
			id,
			multiplexer,
			flate: Some(FlateStream::new(CompressFlateAlgorithm(
				flate2::Compress::new(flate2::Compression::new(2), false),
			))),
		}
	}

	pub async fn server_closed(&mut self) -> Result<(), mpsc::error::SendError<SocketSignal>> {
		self.server_message_or_closed(None).await
	}

	pub async fn server_message(
		&mut self,
		body: &[u8],
	) -> Result<(), mpsc::error::SendError<SocketSignal>> {
		self.server_message_or_closed(Some(body)).await
	}

	async fn server_message_or_closed(
		&mut self,
		body_or_end: Option<&[u8]>,
	) -> Result<(), mpsc::error::SendError<SocketSignal>> {
		let i = self.id;
		let mut tx = self.tx.take().unwrap();

		if let Some(b) = body_or_end {
			let body = self.get_server_msg_content(b, false);
			let r =
				send_data_or_close_if_none(i, &mut tx, Some(RefServerMessageParams { i, body }))
					.await;
			self.tx = Some(tx);
			return r;
		}

		let tail = self.get_server_msg_content(&[], true);
		if !tail.is_empty() {
			let _ = send_data_or_close_if_none(
				i,
				&mut tx,
				Some(RefServerMessageParams { i, body: tail }),
			)
			.await;
		}

		let r = send_data_or_close_if_none(i, &mut tx, None).await;
		self.tx = Some(tx);
		r
	}

	pub(crate) fn get_server_msg_content<'a: 'b, 'b>(
		&'a mut self,
		body: &'b [u8],
		finish: bool,
	) -> &'b [u8] {
		if let Some(flate) = &mut self.flate {
			if let Ok(compressed) = flate.process(body, finish) {
				return compressed;
			}
		}

		body
	}
}

async fn send_data_or_close_if_none(
	i: u16,
	tx: &mut ServerMessageDestination,
	msg: Option<RefServerMessageParams<'_>>,
) -> Result<(), mpsc::error::SendError<SocketSignal>> {
	match tx {
		ServerMessageDestination::Channel(tx) => {
			tx.send(SocketSignal::from_message(&ToClientRequest {
				id: None,
				params: match msg {
					Some(msg) => ClientRequestMethod::servermsg(msg),
					None => ClientRequestMethod::serverclose(ServerClosedParams { i }),
				},
			}))
			.await
		}
		ServerMessageDestination::Rpc(caller) => {
			match msg {
				Some(msg) => caller.notify("servermsg", msg),
				None => caller.notify("serverclose", ServerClosedParams { i }),
			};
			Ok(())
		}
	}
}

impl Drop for ServerMessageSink {
	fn drop(&mut self) {
		self.multiplexer.remove(self.id);
	}
}

pub struct ClientMessageDecoder {
	dec: Option<FlateStream<DecompressFlateAlgorithm>>,
}

impl ClientMessageDecoder {
	pub fn new_plain() -> Self {
		ClientMessageDecoder { dec: None }
	}

	pub fn new_compressed() -> Self {
		ClientMessageDecoder {
			dec: Some(FlateStream::new(DecompressFlateAlgorithm(
				flate2::Decompress::new(false),
			))),
		}
	}

	pub fn decode<'a: 'b, 'b>(&'a mut self, message: &'b [u8]) -> std::io::Result<&'b [u8]> {
		match &mut self.dec {
			// todo@connor4312 do we ever need to actually 'finish' the client message stream?
			Some(d) => d.process(message, false),
			None => Ok(message),
		}
	}
}

trait FlateAlgorithm {
	fn total_in(&self) -> u64;
	fn total_out(&self) -> u64;
	fn process(
		&mut self,
		contents: &[u8],
		output: &mut [u8],
		finish: bool,
	) -> Result<flate2::Status, std::io::Error>;
}

struct DecompressFlateAlgorithm(flate2::Decompress);

impl FlateAlgorithm for DecompressFlateAlgorithm {
	fn total_in(&self) -> u64 {
		self.0.total_in()
	}

	fn total_out(&self) -> u64 {
		self.0.total_out()
	}

	fn process(
		&mut self,
		contents: &[u8],
		output: &mut [u8],
		finish: bool,
	) -> Result<flate2::Status, std::io::Error> {
		let mode = match finish {
			true => flate2::FlushDecompress::Finish,
			false => flate2::FlushDecompress::None,
		};

		self.0
			.decompress(contents, output, mode)
			.map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidInput, e))
	}
}

struct CompressFlateAlgorithm(flate2::Compress);

impl FlateAlgorithm for CompressFlateAlgorithm {
	fn total_in(&self) -> u64 {
		self.0.total_in()
	}

	fn total_out(&self) -> u64 {
		self.0.total_out()
	}

	fn process(
		&mut self,
		contents: &[u8],
		output: &mut [u8],
		finish: bool,
	) -> Result<flate2::Status, std::io::Error> {
		let mode = match finish {
			true => flate2::FlushCompress::Finish,
			false => flate2::FlushCompress::Sync,
		};

		self.0
			.compress(contents, output, mode)
			.map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidInput, e))
	}
}

struct FlateStream<A>
where
	A: FlateAlgorithm,
{
	flate: A,
	output: Vec<u8>,
}

impl<A> FlateStream<A>
where
	A: FlateAlgorithm,
{
	pub fn new(alg: A) -> Self {
		Self {
			flate: alg,
			output: vec![0; 4096],
		}
	}

	pub fn process(&mut self, contents: &[u8], finish: bool) -> std::io::Result<&[u8]> {
		let mut out_offset = 0;
		let mut in_offset = 0;
		loop {
			let in_before = self.flate.total_in();
			let out_before = self.flate.total_out();

			match self.flate.process(
				&contents[in_offset..],
				&mut self.output[out_offset..],
				finish,
			) {
				Ok(flate2::Status::Ok | flate2::Status::BufError) => {
					let processed_len = in_offset + (self.flate.total_in() - in_before) as usize;
					let output_len = out_offset + (self.flate.total_out() - out_before) as usize;
					if processed_len < contents.len() || output_len == self.output.len() {
						// If we filled the output buffer but there's more data to compress,
						// or the output got filled after processing all input, extend
						// the output buffer and keep compressing.
						out_offset = output_len;
						in_offset = processed_len;
						if output_len == self.output.len() {
							self.output.resize(self.output.len() * 2, 0);
						}
						continue;
					}

					return Ok(&self.output[..output_len]);
				}
				Ok(flate2::Status::StreamEnd) => {
					return Err(std::io::Error::new(
						std::io::ErrorKind::UnexpectedEof,
						"unexpected stream end",
					))
				}
				Err(e) => return Err(e),
			}
		}
	}
}

#[cfg(test)]
mod tests {
	use super::*;
	use base64::{engine::general_purpose, Engine as _};

	#[test]
	fn test_round_trips_compression() {
		let (tx, _) = mpsc::channel(1);
		let mut sink = ServerMessageSink::new_compressed(
			ServerMultiplexer::new(),
			0,
			ServerMessageDestination::Channel(tx),
		);
		let mut decompress = ClientMessageDecoder::new_compressed();

		// 3000 and 30000 test resizing the buffer
		for msg_len in [3, 30, 300, 3000, 30000] {
			let vals = (0..msg_len).map(|v| v as u8).collect::<Vec<u8>>();
			let compressed = sink.get_server_msg_content(&vals, false);
			assert_ne!(compressed, vals);
			let decompressed = decompress.decode(compressed).unwrap();
			assert_eq!(decompressed.len(), vals.len());
			assert_eq!(decompressed, vals);
		}
	}

	const TEST_191501_BUFS: [&str; 3] = [
		"TMzLSsQwFIDhfSDv0NXsYs2kubQQXIgX0IUwHVyfpCdjaSYZmkjRpxdEBnf/5vufHsZmK0PbxuwhfuRS2zmVecKVBd1rEYTUqL3gCoxBY7g2RoWOg+nE7Z4H1N3dij6nhL7OOY15wWTBeN87IVkACayTijMXcGJagevkxJ3i/e4/swFiwV1Z5ss7ukP2C9bHFc5YbF0/sXkex7eW33BK7q9maI6X0woTUvIXQ7OhK7+YkgN6dn2xF/wamhTgVM8xHl8Tr2kvvv2SymYtJZT8AAAA//8=",
		"YmJAgIhqpZLKglQlK6XE0pIMJR0IZaVUlJqbX5JaXAwSSkksSQQK+WUkung5BWam6TumVaWEFhQHJBuUGrg4WUY4eQV4GOTnhwVkWJiX5lRmOdoq1QIAAAD//w==",
		"jHdTdCZQk23UsW3btpOObeuLbdu2bdvs2E46tm17+p+71ty5b/ect13aVbte6n8XmfmfIv9rev8BaP8BNjYWzv8s/78S/ItxsjCzNTEW/T+s2DhZaNSE5Bi41B0kFBjZ2VjYtAzlzTWUHJWtJC2dPFUclDmZPW2EFQEAGkN3Rb7/tGPiZOFoYizy/1LhZvnXu6OZEzG3F/F/duNf6v/Zk39B9naO/yAuRi5GHx8FeWUVQob/JZTEPx9uQiZmDnrGf5/pv93+KeX0b7OEzExs/9kALo7WDBz0nEz0/wxCAICJ/T+QmoH6v0V2/udCJ2Nia+Zs/i8L47/3f+H/cOMmNLS3t7YAGP6HLIM7nZubG52pnaMN3b+kJrYAO2MT4//IGvKquY+4Oly7Z01ajWRItkE1jacYu9tcSU339/OnBkYgUbBD9rHonA9pvJV7heYuoFUpRcnKi8RwoJrSkW7ePD6N3ANHPr1UW7wPu5907dLnd4hlXwziROJkDgejfKv5ztZzPgXoUaEPEsM6y752iLyMJdkKwrSo+LAiaFp4HSRvSAnMT2Ck9JHIyQNuaFslDhaLQMIP+B7AGRyZFXeqpFF8HvfFVkQHqGejNjdizFvRHkndAl8AtfEqRHfxPFAit0twsNMyaONmusi/YHvmbQhpTRnyOV0gg+tXzisWmDsLBFAutCcGRHR0Cigere6p3A7NDGmBxHAZSmK/LGHKCeyUqN9fyBIUmyCtV99ptMaQWt4KAny5Fg+nTU1gBvBq4RvHlGCF9WL+2ZxKDfB2gr2GQaUY76Tv7x79VKbxwC5GITg2q02XPy6ZNFnLryVCGskiYPFPQLAsU+LrTvbyQTk7KNUFHwzBUTP1MiKg9LCdWAs8BZx3FHYaJyvIPw4nJpUAP3rP8GPdJeb3iIJ7i8xf15F71iT47rNv+qCXaQD9NBo8PcRVqnEy3vyrPG5SO8HwSDk9PhQJe2xo4Q52soIDB3v1jYYmR8ZkuoNq3Moy6BDjR1WBCTFJEHjdSSADxzRJ2hnozSOLmzTLuKgwWnFU1aGpQ5S8Ry7ME7gVb+CwnFvVtrpofL+DXvE3CY9Fhqe0y4Sq1yLyn/vcgA7ShFG+QnTB5zaKS3Ndj6LSCxwiNivY9R9TsAXobw4Exqog7xCAjYxNIbDuo/fC1QKpFUzvxw+7Rjc8J2lJg80YveK++I5fqJVAFu0Gb4SuJAd8ernBkpyy9lbou0enEfQMOjjucNiy+rgpU4pl+ERgt/Be+8G9l0RbeUwthLZp4ARnBHAB2mcB2o1cJIbhXnMiYStLmjwI+i+NOhBvRV8nmAVslkGdsEVU6Q3hYy/cT/QRTbEF0W58bkYPCyx93ESp7/sWkTG5i9GInCwW+zw1NIRfi2zkuz7KIzOlg33b5/R60L2tjlPtcLjZYL9qGWXwgPApKkndbDq0HhRCQYTyEZ1nC4MFi9NuasFm4t4UV4/W4L0A8YwsXH2m8Rh7hl1No5oIIlAGi5Er/amKw5mAA/Hvwbzfd4TGx66MHWA9t6NAA2WPx538griN7LCqE2315o09fNbOumI6fM1CN0AJT2FheQgaG4tdPFPn6uAeDXUDT8OkTdRFNi6Av4rwo6NnyfLnLYxBNdAhHs75bAedI5egbRrWLC48JT7aKsV+VsOmLsk0TGh6ISxI3WzskVbVFr6HGLy8jee1ZiMF0wzd/B4LvlyGIMa6HD+JBsGOH6vukgqV7ywTl6P+Wo8mTZHo12d7u09Z59eyXJcZKnqY4YzEzGUrlGzvO0Rgfgsse3RMPWJSpsETWqo5zMTtzYk9HANeoA5ubNoO/jjtLyModk/iH6XLiFD1591q+nXNb3Ve2v/aHlJQQYaytpOULvnsEYGIQH9+y3eK1Rgqgs7fxD3uzpv06A/afiToieIJpbjLhy3JZBEAmtN5UgJm6SuCbqgKJ+fDsuwMp/m0fCNVqrYORcBpKTvIWFzWF/leWJntKUis0dPrWy5x7Yu2GhqJh3GN2bT8w1uIh1haSlBmhMOzV3yNUmNcjqFV+GziNt6twoPDJ+4m7TE7hP2E9mEhiYihUDjT0X2Q4k0GIqdIl6fpoFPK0zdfRfbEkP2Ulr7fzfVqCYp9iuxtZFqBafBWLNHVjYtIn9/Z6Z3mP8DBfOYrXbMXldLjKW6rHr3w/LACe+LINkxcxQ9rxxBffepkhhj8NQ7vpyXpudfYmfPMsnai+b5VI5QMcyZly26kxMo6KGGilNYyX/hLaowV4GjIEY7kHRCNmJIBNevb1ag4w98wLWMtfyPMLn18o9cFKiJk2kjZmRBFh0S0Bd7AjxiNO8YdDQ83lBGS5JrxmLG+hW2oGYQllWS2UjK3+loONmC6NpPNgUiNhDQ05s24iRJZ/bzrgBskPLGukoMu8NK8CQNKZE8zzmsCrnkU53iPeZd/UT8ox6WMMZOtDv8YyQpTmhbzXCQW9ogbfgqH447dJFZuPkT4MGfKw+0c5L6aLWqAadBU9yLftFVsi8GZOSB9Ctv9/fJZ5SmlNgt25uGvspB9y1PQGEmLQyjFiGK7kveEw4Knn9lv/9GV2YlCdeRTAUyOS56k6G4ajfxNtMHPaDqIWTM1yBem3dShwkhD0nMXit14/wHRHosy59T+nkuvxG1MbTx8GJM45rvrOmUW0nwxNNdsdqFCNPWn+GcYzIdwCNFtHmdSKNOecfZZVJnKzuGbs41wRQIkv1E1p6ITiPxv+zKWflEU76wHOPrDx4rmyw3Z6MqaP316eOcW43JwBvp9hJuMUHr0TFkvjd5KzvmUSrZfYvpPZ2humVwOsjChiFzc7aoBMt8MdXyf2LIhuhBAg8Ue3wLqlg3cEYBS2z+uzrS5bJzmzH3NGmI+M/WbHOkbqcNtSoZjwp4NI5bSpCKWs7BqrK8sfsUC+UpA08Lfc4CpcBmsTyuHncO2gLc9jPMT+SBAgiZxTDncaiM+YG19ntqYSttys+jpASZDwEWjYRN8QURClAIs0G0KKoY0jjWcc0rypYXiCsHD9+kjtnYJHuzeZw2GQ5U5j7acLM8nyuy8bSJaKZXFq8TJkQ/p4lSkKHpVQPi+dWF4jYaQFEGiPAuiLOGzOE/f8B2rePs9zps7QivUyIiM8fsbPx5mwaC7FbjdihjbM198akLx99SpXAF4fh6d/xwLppw2kFrKa0UsTa/emTuV+6l2/8WmVWLd8JJAhcE+qbMrJBrohgGdDNZIRxJOrsFCzSmu2ykTCZnZlPITlbK/hUA/+DwdtJbmzKczEWAS9ENNbxHNSbn4Nqsz0yvhUE2a/FT6tvnBbXm/X2yLQQhxuVyNCsK2TeUNifqlsCEAJAALqqNI/NX+owJEAk+KehT/fpCsXGTsT3kFsUiPNWAkOEuHviK3Nzpu53edKRZgInWOWhGnd8aD6k7kio0tLT8i/PkxVrdZftlNrqPZfiEXkqX3hM526HzLGVzlr+CvTBKxsU8ROxHvBGWzJk4Tt0uDhZessy5BDFVx2xiYxMTXfQyv8NF0Op3CKCFvH1KbE2Z2TGCvpOEH7LKVK5TyTVSP+yah8TkpL1cHorIRxz2a5cMNMZGgdooqszII7PJuT3Ii0GpCCXe3v5mzysGhVKBulynWOeMrlJ4jKA4xzAXIg7ReLCGOntAOvU7qD+5UBufLWxx/3cqhuMcZDnR2dUjJuFG5LuFiwnvboFRMjVTvVJkcNdUc7b+0auIQWC1E3hTQx422OCMuGvayP3WMCGe8IClwSw4f1uA5LkoDYZbVQo1SUzETYNPQUK5BTJy7YRq4ln9vLvDHDImNd3TiWnsL7Zp9qWVSSTfSVSyZTT4fJqKIZ/Kcy7IkXFyv0Frw64R7y0vM+tAu+0kebn9y+DlN2xmi7nmf81iI1xffS5+ehMzQJTIa8SjVc8kCf14eOLiR7TgCnHcJieDFQI9r9K9co2G0hpitdihrbb56XvossnHl8Fu4JRLBPgKXsAQyX3v3BUHuw42rmeQXz74oZzmEIG13oteilg9HOUyoR5NHE94cYtIqP80qheAh9uQA9e3+TSmiLy6dsU625mYOYcPixVm9ZYuiOtLWQ3tT8j2T111qqjqNu6yUSxlIAh0+ANUEhEh9Uoj9v89/WqlGXNWPDmKfRtn+yFVoyggl8PjW0GB7qfreaEuoqouCGoV+lWma6sNZyKYQGIn51nzIyO1uUlRQZq5j8aTQgcXlNYi5rXALJ2Kj8nEbJT8OqXEt0fbWPKaLQZch23yR9RLyaXMpTIzzRBkoFY5g0MfTWFLbcMynydkZITcfLTSDeD/fxSqUzWmgjk9j1aQ07KUBInTRErSbfEhgCVikEENWXpOubo3XV4YBv9CJYSuXnSv0d3jLQdHefqwT7+Gyqy0ZJYicFYw3ma+acapIZw2r4qg4BNKbSbkMKOuWidsr1dxjS9bjSYoNH/VDBdbgXpXTpPJosDIjwMHsV48OfhwZjvnAC0r2yJ3+NPhBP4g/GU14mpdefzvR08OElSHLpZidGsL5GGtpzcohM5sQ48TMsOs6Cy3vvgKR1oanGjGa8dRN+UaaAWm1dieSOjvXzIIVPp3zoKEgVu9zlP2W5NtNSVDfceVy/cA2IFjOlKa5EiLEEA57fuxvGmOvxCB+ZROvg6KOi6EbxLMylQEbvzctlbmEJ0S32x1usYisIWFfCLX/SEETVFuAxZJej9AcvkolOkSLNlohZdKzOYeRMfQM/RMT4JwSfFqHgIq4XeYPtTzMO2ZkTdOjdrrWL0ZMFosuXiKD/9qKKbo1FjqjwiT5a4uIaPdU95J52kiPoS7adOxUFiypbB9SrLFTABESJrPr0qMSVCi9cMME+Vt2Qq9gYFIvXoDRAR0SP04c/2A1r/tvxBu6JRGDB9cwYWOE1g8W+W/vju6WwPvifEO4AQ+KD3bGEhffrUWM1SnsAZBbJOgep/M1iU/HX4uNGb6Dmz+0PQdJAo7TkA2D+Wigyb9CQUfK16vwLvIIvMnylTcOOIAUtbiy2/lcdbmnQcFMt7ZZLQxBemf8S5L8jkyl1WLZyVNGDm5qf/72TQLs6KK4ljCJqMt0F6p8tidu/52WK95lYzKiZy6nlOSKadsCEWX5+eMzpJu8ZjYF5Qf1K54q5wO/T4Y+QYoWlUlXB6MoL0adwXmSs5T7Mht+6k8BO7T5I+3iI54WdYwixTnvlI/TNQSjwGJdxqJOmInihyKgkCx1lUyn/fx6jKZ+1MHPZwvfOg5V9TuCf+aXvjVhcgJHJBilS8ytrZh8FQh23yNbEIMoE6lYyWuYdSKv6831VdffGAP6gvaD3d9aUBJRkHquA1iqVB/ZG+bcJLpeMFJagd95AvGXUIuYwFKFmBtlKkjOuiEbKNKxv+SJ/NQCIGRBxVkm6oqcabuFnskNEhB4FnYnplnCIUZEfsuLirqsm6sSQZ2ZITdUAkmQ308cj5051V8FwogjNmZJyYuNNsOxYzumG33B7Z5k6QHkr2HC4aky5ZHP2bW8quZNaSXEcL5YGfZeTPTOVCv3TA+e4NLZeVocXTUYNWe7pyYjaf6EUeHdXOAMpZk9084KP8PBCwnlNfiZG2fXD+36bvn8sOVcsLvwAT01LEmVgo2E0geZqDPd8OIHJxDVB7VXNeFYIKjKgOjT63Bq49GLdBmwOlTKDljg00eYqLTQO66FPzSTWMc2EMGCae7sVr/OluTg/T4NKFt39gySNurVvPtlXZfqCo3GfCiyTV6iZWeuVMh69PrrozqgCX0mHJ+OyzMtQrTbqUB4BvHZe9Bfo/uyBDmRDWV0vTCz1mz0t+DTOjRkjEiAOFOKSQ5w/L3RgIwmuEgW3kqaQqtwAFIfWb9PxNuLvTLGMttZ3yO5P3aYl9G6jCSrrcr+3m0ICKOTBu8lH/lonRkZOq/08lpP5VtCEak6I+aSIT9tP9LJIZACn/IUe7qE88kjETKmnZT6F1D/1p58pEA0NI4g5CtdHlSXmg0s+zhAKS7tYpvNx96EPw5cCc5+VneGb0RDNvLaa+cEF4M/JuU0PcA9u9gu+PC+byS52tGqNA8yuH7El6JwFI8dXUvX07iAkC2VOvtt4kg0aeiHDyPHJpvvN4TaAH9Bz+WT5FDWNTAz4LC79GO6pQb9j5iojBlt+UUHvr8nfZN6AKa57RMsFTt9m0t0eBVUqR5fgpE/k6+57U9FtAQPZ5ufj66n0Ys1Chyr93K5jhX3GM64JjdryhghfffO150Q+hYrX3a5/fo2ULWBM27UoViPGVCFtmd0Yw1V5F+l8j58Mck1yUYxpU6tg+o1tara6THtW91V2dqC0+ha42qUVZhScMys1ygeqrpwVTvfhsaVH3/e0xXB7cO4UYkBg1ivB9O+90jwFfg1noBWOg7JpyGvPzYuLPz1CzNtVCqtRpqhMbCu4e2xQ++w8gJGD87TjODSjvgsXoDOs/Fs2qzhSatxvKrnW6pmKqwo9j4B12XZ4Sc+4oE2DIquGY8iyYrp9oBkSCQ8kOIkYVD74yj5C+Y/+JkFNVPwwBvarswkuyZUp8gjHCBLFkf0l+yBDWvJ/jZBXyUFSCGDIrpl1USocwndJFH5zst9/ZyaiKGKEO2nEBAuOCo1XTAyPLIjonN2pH7c01ySgFXymnEV0K0UGq78eDfUtxpmcGLtK+75NVraVGD2wNVNrpWJl1al+s+CM4OvabLcM6VnweXcGciDFRmghhWVoE4EqnhFUuFxCB3umtoyn8lKuEy1fmrRsweDOMtUNd0qA6IctHwIM0AOX2Sx0KxqjEhpp+YkfStkyLrzC33yJbUqRbgkDGq1fKfJDAdenpfQOVj6VMCsB208bbzJUcGOWzZtvfnETOnRLxb4LddrcPuP91CawvOVuAphNrIEUsiRon1SrCuL8GVF75tbSHcskqjIVLfycIZlvVjlywu9gBptiORxw/e1CZ7bDeKlTTIK67KQqosSEs1fnc/X0aAxlkqaOEZQdefKhrABuZFa/KTPRhQsFSncg6wI+niscy0rjfkkvg5fe4c17WCpa0eXot7t+4ot9O5+v0H/buYYniE4MzfrsDnJhqu1tLt1z0dNQ60Qz/8RxR7461d9KxJaNTelFLXDQwDHcTCBSk+0BrJVKT9Ls0bHgxr0zDoaDnbnlXjuu9+I+TH6sZYee1kDBqfPV/RKaXBx6yCFxEBosyCqvwmiuHUzItjvCMSpgREhM861FtvcyaGbN1+nFgM0NlPJQdpqz7bpEJcVw8HFp0yAAT61uYy8m51btG5zFKE74t+qEpjkQPOxPzxh52MDHVgMT0vIQcdA2GGXmjLInOlKHy44blBXKhSsvnWk6goe3xaY/vatI9iOJP0zdmqYuV/Z82spbMuwMwDVEEqrn/KPXqWl0G9AIAPPSA/DO5U9NZAn8nW5CcnB359CkSxVmBXbPBph/GvVrjZEiohjaAfRzdYgSBArwPcIhmfsE3ankfWrXOiw0qJgH4UvOuQphVkNCTIDl405MQMo+6Usm6YMkKx93V+wFSt0l6zoNYeELrp5hNwWNc35EVD0YJegiTIgVDqJykV3YM5po2UCDF4a1Ijhgu+mWL/+B3K8OcvmsGG8X/tKBCNPK/0jJT6PKfks/NEJDkcRcfm1ZDp9AFzldq53UZoT4o4zhRSpLA+f6VTIJx4/t78vpyZKMEJmc8RbIp/swFrbSGInwW4NCrovIK+oS5Z3zXeNbGSpuf2oWYAtpQvttaM2LNl4svcEwxvYor7JMy46l1f2SB0Q0PXLIehirHvMLhbfdWLQw0QB7Gq2O0khxvT1LjZ+H+euX7uZmkY9IvXdW0pnDhaNmZKT6nKj9K1bcLT3520W7lrdOzlEMHxtoSMMd9u2LtEkdtO0KIyfVvkXReY+ilkTyBUmcRCEWl27pABXdcl9jZn6A/16Ze1Lv9SFRncN42vpbOS3xkIBPtFwaDftP6IZLtchcxmj3xkeJFH8fFKg5f06HvCjPbxR3US46FTJqo49yM0H1L8wOjSC8wYHb4Mo6Zhh4i48snY9IOVfrIGqFfTsTQ5kxIctBPqGnMO7dl+iu4TUqeHkDk2IkmZSNjB7hp0mmLHKcTAB49JQDsZdlPlcOeADP/r7q/I5vXE8ZHzXqFmxW9v90+JMckU0V0AIrcJK9IQWl4LQR+dRuKRxJwDpy4wa4ymhqnBdjDMqQ/cetUExuVkzntiCPyOz6dMpAx9ZeidxQ02hYjPVqgFg8sCl1lTHTulvk7Nj698usBJMG+IKJorZp7+a97Tr226dW1h++Ic3ERIIDuFrJVY0UvO/vrTZrxZbzT2Ki+UvjN5Ins+P6gU7XLKlAlh4h3u54VXMJO6MqqpSFKXQlRY2fOOn/m5YDfOCvjmhsmrp63Wz9s+kowNsciO+DZa5Mce5qH9/ysvEHv7Sgb3AIZ4+zl1R9px1bU2HI/tcieQUvHkNG0N43uBelEbsrZTfVDAsk7KashZp+QG9k91BWuxlN00Hmaqd3foNx2EwoBe14MbFyJKr0PLJvFrMBQamhlWX31hknK3y9m7F3cIopvO2kIngxuVgZ/c3XOMnJysZcmgeVvouinM2GCcJF5k54InnSO0JJ0g4taICxSdD1NbXw4aVfuPXY2loCOKwXAsHW+vRvIu5yBYsAXeOX1J7LwWwVHOTLjQDRyIwgAsot1J4dr3tRO1u3s72SospfgKrMJdMYtrSJ6zvRQTEDXZcyk3fqtElG55syIjePTyPVPDGCGHVvaqOCWvYDXnsFAy9L3gVg8HaLMerTRuSzj6HjRmyZNheBBZkDOTRmc6yaJVhK/+NCpXgPsW3xyAX6ZGQ44NOAyn9U49Jz5VIUpEfXTK/hDaJeMgl/HmLcfxbBara5U+J5xi9IvwTcMMzxxN/sm/BjLc+34gP33ChIncbfHleQbbQvS6JMkySTA2PCbI/vwYonIZnymVtA3c4fC5zso+ZgTyvnxZkeJdDRPjTUtP6DFIAxMbIotg2e93CXfUp4ciADmTWa4IbuP3n602bqsqzTldZAt7UzolvY0gnTcmZWJC8dCoZhebkdcf9hd+jW/HdVo/YM6s39d1Mqm7PnG2dsXFSCn+yg1redbnDTPpUVi1+T1xd6dGeM7GddroA/qyNLl9dvdvCUGQvRL7BIFQFUZYXRdx27OAStt+iqORvuibZWfLufrRJVM6AoyJNpRo4rALSdtAcfW8d4HJGPEaP1cxl6ErnQz+yDbv+zRMTFCJiuPTJRDXD+ir8hz+eChUN323YpgVJ0Qjl9oqEj9H3SKORfnFaq0337C3oyz0eQ5PedG/d78nJzRP+BfQIOFMDzPSJ40yg+MAgX0P6ZPOiBIW7c/i2j6TQhVyeEUzsjRMYMMiGQl/lgTz9D6Kc/WP4tzbzhRb0Icoy5+sZRiap1rQFjaOVzGUEOXgMoME9voaumyWcTskYTxGdil9CvKBKsHCFx8iZ63V1xcmT2JnOVuYEAqOwD6bSc6KhJznv+nSyG7HNY+ycCXP1NBoG5Z8QgXEcJxUMl0SDUaMAqM4K/NL+ZiQHDbDL38U9eBa9zYaG7xronBtZ7ieC2yMOcMfz4tSvATwPeH+qlTOJQjBtFEzHkFV84bUdVYLaMj8/oM+rVU/4hZCpXR42AXjhfEZBT2M4YZv9ciCjNAo63zbfTv2zt7A6ZYVUkRFW3mRQw0EP7bmK8w4BcVzhy2U0zaJqlBAbc1i/4A+0lmSnyKBISJRF4lrGz1dIsCpZ5AeuDopJNc59Rb7viBjmnA5rBqdrxPhNnReYbJd2k3g7YPAV21Hx4wf7oUsVn8Mu6dgmChDCc1IEc9jxSnHYCWqlCA7YBeUtXTXIJf2qe7knGliksYKnYfX9RnXdeDoIbmKWGsV2mnK+oJPzOlF46TC391bf9GBe8T2rvcXJINCfZBmS60iO+5Yo2NNJQi+Qc9SebaaygxTZOj6rIbNwzdhDEUYCG8zfS9KmEhZKfcz5+9oCIG6mM8oh7q79yxzDIzdpaotBKCgJ9M8jtC/Ee5ZI8adPdXMkB1EEzaGWZBuBvzecpPmTyhzpKBy8FB0kKhEOjY0/utP7JAJKpId0xWuDDsFlSsbCqPgb4wbUqID7Qxu6FUJ1QGCxGYA+u/NXFQesgGrYlWKdm0zY62gtlUv89zV1PwQwB4TNtP16MrfZAuYhqgR2xJ7ON7tWJ49lVyjB5NbzlCGelLKJIkoicwMz1CSQ8b9SO2qk+WMWUPnXqCsHBSU7ews5rZ8ccw539tfEBj9UNPUqW30tjb9BIc5q0ypPa15S8ucZOGEpSGyRLaf8SdSxw1JDsq0vYF04PoWvvYyAIAVNl6ACzWEnCPSzVAb2orLKO2McQpRAY4I762BRDhBt0R6a1Qm9Hx9g0gUfQE6iXBniPe81OUTKzGHNKxHzV2sP3HgVlBmB2M3N2tJTzb65XnRGKLGOgMe2/eVvLj54lK4MRe5vTJG1QvZUKbxnK0YdMNE/N/eTPwJ3tB7tMyVVVDEUQpzKNtWqrbKvtQcxG1Dy42DjnsCW+DNlXdgmIKcG8ZpJT9vTihoR2UAK1ZG1WPhVF2oNNvQGU3z3hIQ8VNmdu0EMJlEu6v4iTlLYi3E68RpLs8Eq1d6csi6nKrJRssSwsm8ApR/yO/p9c7dYj4EsfcwhxzsfgLdpu8SKZUUgHkSs+KWA2F3fHUawrHUZvl4xdkDqC/S4vi8CweW7ed/VvuriZXHgljCahrwhe2YRn0rZl3Kvsc3wz2L8XaRhusY1lT5Xy8rqsCiKFcuevI7DUCV2/c3uuhY08+5+qTihQwGlrJTQo8iTNr39o6lcoalqyKYeXWoQEKpUQP/SvTT5qhq+7NdJoB+q9JkU+q0aEQwqBOF+rdmRUeYEMWXmPiJ7NndcQGuAJg+M5pnbB25DUv2zP2Xqj/PjYypAJMMavI7YgoIlZ6VZ/L1yqU+PlABLp7+A93JgpG0hv221lEPIWY4+RNr3yyhPnCxtGA8obgUDu/6FIHqq+hxm+GfZx2DI2TQjgQs5yJiUyIVoXbmjjoBX0axEn1x3xsa7YlGVeFw1jeqFbgdIFN+KInG4kpJVd07c4BLJiITZFodHExoFD65tsX1SLXpZgdoljKwDo2DkacLCLiaV8PShqJEjo58uXdCu676mtSePbGyW0KZigAPGEpUEZ6zc1l9cZXjeDi2aLJpl6sphMR/B5aiIz6J7Afj3feUuq5qxxFHQC8jR1C1hPV7ZxF7Sub+U5iB+ynvUkt4iJd7kxJDARVbZPBbUSb9/ny0nBbzZmkRE6oi+0ocWxaH4ZnVrsL/NgnFPwKuG2IwbNCHls26kUeON7qS/+j0PLAXzBghwiRgBku1clT/tM30AS1mvJ6cKDjjLPMei7GwGHaJFfQqEjjikb7ktX5O1jVMlZTrNGliwOK1fTh3jE9b5K9AppT5IFuPxhbJ97+HMazBEPtMA9aZBIKXNFIvdPPCs0DHt05HzygjrejibsBA/SS2F+gSlANRlkrJinMIpt/gdlvUbjaxFrMupGmVCoMDfRDrxO053FTh8nto2pA2ActBghuqLM8p91U5FtVhXU+FI8whYX5WdWMmWc2E2wGzFz1aCKYJIC/qr4xzN305xQLxAVb2n0BQedGI+j38cc0ECk1NxJ2isVKvmhk5RyzSc6EPzB1884xko7roUM7NOu0FiPw+Zu4R8OGoHRYqsigkTRxlmL19aGEbBbdK9TmGBvwCd307SHj2GojSWN7DL9olp1+VMMYQ9UG8DTX47r23qkXZ4z3ctQl86rRjpzdj+70XvZb+h0FzgnyJmYSHxIIn2FWNYmvwPjyiBUgHYP5RoHhSJoeI6W+nkFnHijreTncsonIU5FKlqHQFGzzdc8s9U5sfrMFtR1SUYFYWj3C8KP0oQwiXZcn3AcqPkTqVU0o5kRZ2+QS+fJP1ozNeh6hKJSpUVSb2LZ9329cfBOPAJ7u8zYUqJZ8CIzIa26Qy5ADf5bco2Z18IcLHAulDYBXxaBCm2DXpryNEQMYWmMTHA0mVpIFVkmU5dfnNQykdZiAXU1l+Fw6kIjrMJ9AgF0xWiaZnOyTehWtuxU47hvUm8B2A9ociq2x5aFOxazc3YG5IB7IZmXercFhEWIMzMw63jvREmRjCT5ou+MIjmbi1na8d0SaLUudX5pUouPbc+4stjuNveU6cNACO0s+nbAlVyZyCeRMAPk5C+11kHcwSNd8IZugXSih5eJ4xPoIW0knz0365CjhNUfz9+31qYzK0lZNMUCuf2K0vrUBB/i3T3gdXMGSeldKp3Lx+tz/bpKXTHtUzzsvdS9Gs+uMIZ1XK6AxFyeCxOJ+cU9XN1fBnLPe2JYUlJUmCu4tiwsprlamaRzZQNWlUxombEZeKC7q3mwHcZM5wU0ICwEnLfTxW0VL9N10+batqOKxQnIspanPsw1ez2cuwr/hQSPXqoP2gIkFZnmAqUKUX8GZ5ib+C60pulz4Uxz/QvZW7V2SAAGcUwS30VsW6U2Ld2v5UbOfEQCxPdOHJZw75sKgEdyVdN1FDl4JC6s8IUclP+LD6R/CXIEDhbSWuXdTsAinSZLlMH1LzCXp6Cqvih/NReD6FJezE4Hi0sUGxti+4YngNBTWhUOblVY4+ioJs/kpVyXoAksKXh+Fe1j1PG2gbHkCQQWWCDqufQCEypj+dCoj37UreY26CogoUkVCnNUXQ5jZNFOPeXjh336gUEGzTt9qLgRwsxEJpQKH+aCWZALuJHtCVlK1WQMM6eM15EjMtRabejRb7eD3Us4WqESLYxpZ5KCobtmQDzV/4vOlvq0BSClPNORXWKygxQ2J9casayyd9DxvL77P41vt3k3fsT5PB1d6WR+6JZWwYJGZTdxyDyiFJDCKV9TuCeGkZQ26g1V0sV/H5a1xciwxOCNt7GgQOajs3aR4wpXxg4GbU0nOR0c9Ii/Sn27VMt4BqnAj5W4fx8q4ecJlPHlG3tSjqKSUsP0rlyg7JRFXcxCUGv7QMYc2K9WLvLEHbBOcM/ZD87o+UaQ3CvTwOkQTDq8hUeOBRxcerQV5Xi6Y+Hh6Vg4aeMpoGdUV7xXbw5oVh/mkSLP70aWsGQ3UbqZLFHrxQzLeDFkYJX6q069Lp/1X+lGTY+5ykXDRtK1n+GarP5tNWi4nd81eFXdracJWwcYk2GA6MbdjMnoaTrfSHXO3EXgrlq6ko5DABSrMg+9kF88aW5LAVOxGADYFS8bniGvdKVXnEhhQDJVCYKqqWKYGpAek5BGeVRWSbwLCKdQ5BcBnn+oEsmp46uK3k8KO72Pn+1hPMbgE6xWxVYPqAe7HVPPjNRiQS6cQGOxU1gdlAuEJ4V7ip4o+TgDM2/M4bthC6c4SBMQaMfRZfL5ko/uf3U2MXch54RJ2/LQRAy3AHiOI6enjY+L88VIvjU+hnmwro8yEflSD4tEMeFIkrxEW19Gycl1BDXpDVbs9nrU5MMIGx6QxCFw8FibHOtcRcI71o8s+OvDCQFsw7ZVMslGVDaprGZZmJ2j4uTgxrn15ihGv020yixBNktFCYgTyPlxA1f36ciarunxld8CPUVUPV/D/XFX5s/Neg2cdPqmSlO/fpnXxz4UJnIlB6hSl82wNGKJud1KoVyDHmmjI+EKBSUO7kNuvrQ/fY3duE75BX/HUAeUiLFKBZ1O2/mThw8t0Wq782ApG12/Jvza+94ENybWDDpLLmTddfEP7cYjFtZZONpGuxNkP8FAAD//w=="
	];

	// Test that fixes #191501. Ensures compressed data can be streamed out correctly.
	#[test]
	fn test_flatestream_decodes_191501() {
		let mut dec = ClientMessageDecoder::new_compressed();
		let mut len = 0;
		for b in TEST_191501_BUFS {
			let b = general_purpose::STANDARD
				.decode(b)
				.expect("expected no decode error");
			let s = dec.decode(&b).expect("expected no decompress error");
			len += s.len();
		}

		assert_eq!(len, 265 + 101 + 10370);
	}
}
