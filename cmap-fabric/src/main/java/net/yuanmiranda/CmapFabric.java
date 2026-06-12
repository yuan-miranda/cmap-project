package net.yuanmiranda;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.minecraft.server.level.ServerPlayer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

public class CmapFabric implements ModInitializer {
	public static final String MOD_ID = "cmap-fabric";
	public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);

	private static final String DROPLET_API_URL = "http://143.244.173.238:5000/api/coordinates";

	private static final HttpClient HTTP_CLIENT = HttpClient.newHttpClient();
	private static final Gson GSON = new Gson();

	private final Map<UUID, Coordinates> lastKnownPlayerCoordinates = new HashMap<>();
	private JsonArray coordinateBuffer = new JsonArray();

	@Override
	public void onInitialize() {
		LOGGER.info("[CmapFabric] Production tracker initialized and listening.");

		ServerTickEvents.END_SERVER_TICK.register(server -> {
			for (ServerPlayer player : server.getPlayerList().getPlayers()) {
				trackPlayer(player);
			}

			if (server.getTickCount() % 40 == 0 && !coordinateBuffer.isEmpty()) {
				sendBufferedCoordinatesToVPS();
			}
		});
	}

	private void trackPlayer(ServerPlayer player) {
		UUID uuid = player.getUUID();
		int x = player.getBlockX();
		int z = player.getBlockZ();

		String rawDimension = player.level().dimension().identifier().getPath();

		// Normalize before storing so comparisons are always consistent
		String dimension = rawDimension.contains("nether") ? "nether"
				: rawDimension.contains("end") ? "the_end"
				  : "overworld";

		Coordinates lastKnown = lastKnownPlayerCoordinates.get(uuid);

		if (lastKnown == null || lastKnown.x != x || lastKnown.z != z || !lastKnown.dimension.equals(dimension)) {
			lastKnownPlayerCoordinates.put(uuid, new Coordinates(x, z, dimension));

			JsonObject update = new JsonObject();
			update.addProperty("player_name", player.getName().getString());
			update.addProperty("x", x);
			update.addProperty("z", z);
			update.addProperty("dimension", dimension);

			coordinateBuffer.add(update);
		}
	}

	private void sendBufferedCoordinatesToVPS() {
		String jsonPayload = GSON.toJson(coordinateBuffer);
		coordinateBuffer = new JsonArray();

		HttpRequest request = HttpRequest.newBuilder()
				.uri(URI.create(DROPLET_API_URL))
				.header("Content-Type", "application/json")
				.POST(HttpRequest.BodyPublishers.ofString(jsonPayload))
				.build();

		HTTP_CLIENT.sendAsync(request, HttpResponse.BodyHandlers.ofString())
				.thenAccept(response -> {
					if (response.statusCode() != 200) {
						LOGGER.warn("[CmapFabric] VPS connection issue: HTTP {}", response.statusCode());
					}
				})
				.exceptionally(e -> {
					LOGGER.error("[CmapFabric] Failed to reach VPS: {}", e.getMessage());
					return null;
				});
	}

	private static class Coordinates {
		int x, z;
		String dimension;

		Coordinates(int x, int z, String dimension) {
			this.x = x;
			this.z = z;
			this.dimension = dimension;
		}
	}
}