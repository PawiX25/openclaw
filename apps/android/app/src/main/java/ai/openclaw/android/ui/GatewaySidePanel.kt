package ai.openclaw.android.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import ai.openclaw.android.MainViewModel
import ai.openclaw.android.NodeForegroundService

@Composable
fun GatewaySidePanel(viewModel: MainViewModel, onDismiss: () -> Unit) {
  val context = LocalContext.current
  val isConnected by viewModel.isConnected.collectAsState()
  val manualEnabled by viewModel.manualEnabled.collectAsState()
  val manualHost by viewModel.manualHost.collectAsState()
  val manualPort by viewModel.manualPort.collectAsState()
  val manualTls by viewModel.manualTls.collectAsState()
  val gatewayToken by viewModel.gatewayToken.collectAsState()
  val statusText by viewModel.statusText.collectAsState()
  val serverName by viewModel.serverName.collectAsState()
  val remoteAddress by viewModel.remoteAddress.collectAsState()
  val gateways by viewModel.gateways.collectAsState()
  val discoveryStatusText by viewModel.discoveryStatusText.collectAsState()
  val pendingTrust by viewModel.pendingGatewayTrust.collectAsState()

  var advancedExpanded by remember { mutableStateOf(false) }
  val listState = rememberLazyListState()
  val scrimClicks = remember { MutableInteractionSource() }
  val visibleGateways =
    if (isConnected && remoteAddress != null) {
      gateways.filterNot { "${it.host}:${it.port}" == remoteAddress }
    } else {
      gateways
    }
  val gatewayDiscoveryFooterText =
    if (visibleGateways.isEmpty()) {
      discoveryStatusText
    } else if (isConnected) {
      "Discovery active • ${visibleGateways.size} other gateway${if (visibleGateways.size == 1) "" else "s"} found"
    } else {
      "Discovery active • ${visibleGateways.size} gateway${if (visibleGateways.size == 1) "" else "s"} found"
    }

  if (pendingTrust != null) {
    val prompt = pendingTrust!!
    AlertDialog(
      onDismissRequest = { viewModel.declineGatewayTrustPrompt() },
      title = { Text("Trust this gateway?") },
      text = {
        Text(
          "First-time TLS connection.\n\n" +
            "Verify this SHA-256 fingerprint out-of-band before trusting:\n" +
            prompt.fingerprintSha256,
        )
      },
      confirmButton = {
        TextButton(onClick = { viewModel.acceptGatewayTrustPrompt() }) {
          Text("Trust and connect")
        }
      },
      dismissButton = {
        TextButton(onClick = { viewModel.declineGatewayTrustPrompt() }) {
          Text("Cancel")
        }
      },
    )
  }

  Box(modifier = Modifier.fillMaxSize()) {
    Box(
      modifier =
        Modifier
          .fillMaxSize()
          .background(Color.Black.copy(alpha = 0.34f))
          .clickable(
            interactionSource = scrimClicks,
            indication = null,
            onClick = onDismiss,
          ),
    )

    Surface(
      modifier =
        Modifier
          .align(Alignment.CenterEnd)
          .fillMaxHeight()
          .fillMaxWidth(0.92f)
          .widthIn(max = 420.dp)
          .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Vertical)),
      tonalElevation = 3.dp,
    ) {
      Column(modifier = Modifier.fillMaxSize()) {
        Row(
          modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp),
          verticalAlignment = Alignment.CenterVertically,
        ) {
          Text("Gateway", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
          IconButton(onClick = onDismiss) {
            Icon(Icons.Default.Close, contentDescription = "Close")
          }
        }
        HorizontalDivider()

        LazyColumn(
          state = listState,
          modifier = Modifier.fillMaxSize().imePadding(),
          contentPadding = PaddingValues(16.dp),
          verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
          item { ListItem(headlineContent = { Text("Status") }, supportingContent = { Text(statusText) }) }
          if (serverName != null) {
            item { ListItem(headlineContent = { Text("Server") }, supportingContent = { Text(serverName!!) }) }
          }
          if (remoteAddress != null) {
            item { ListItem(headlineContent = { Text("Address") }, supportingContent = { Text(remoteAddress!!) }) }
          }
          item {
            if (isConnected && remoteAddress != null) {
              Button(
                onClick = {
                  viewModel.disconnect()
                  NodeForegroundService.stop(context)
                },
              ) {
                Text("Disconnect")
              }
            }
          }

          item { HorizontalDivider() }

          if (!isConnected || visibleGateways.isNotEmpty()) {
            item {
              Text(
                if (isConnected) "Other Gateways" else "Discovered Gateways",
                style = MaterialTheme.typography.titleSmall,
              )
            }
            if (!isConnected && visibleGateways.isEmpty()) {
              item { Text("No gateways found yet.", color = MaterialTheme.colorScheme.onSurfaceVariant) }
            } else {
              items(items = visibleGateways, key = { it.stableId }) { gateway ->
                val detailLines =
                  buildList {
                    add("IP: ${gateway.host}:${gateway.port}")
                    gateway.lanHost?.let { add("LAN: $it") }
                    gateway.tailnetDns?.let { add("Tailnet: $it") }
                    if (gateway.gatewayPort != null || gateway.canvasPort != null) {
                      val gw = (gateway.gatewayPort ?: gateway.port).toString()
                      val canvas = gateway.canvasPort?.toString() ?: "—"
                      add("Ports: gw $gw · canvas $canvas")
                    }
                  }
                ListItem(
                  headlineContent = { Text(gateway.name) },
                  supportingContent = {
                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                      detailLines.forEach { line ->
                        Text(line, color = MaterialTheme.colorScheme.onSurfaceVariant)
                      }
                    }
                  },
                  trailingContent = {
                    Button(
                      onClick = {
                        NodeForegroundService.start(context)
                        viewModel.connect(gateway)
                      },
                    ) {
                      Text("Connect")
                    }
                  },
                )
              }
            }
            item {
              Text(
                gatewayDiscoveryFooterText,
                modifier = Modifier.fillMaxWidth(),
                textAlign = TextAlign.Center,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
              )
            }
          }

          item { HorizontalDivider() }

          item {
            ListItem(
              headlineContent = { Text("Advanced") },
              supportingContent = { Text("Manual gateway connection") },
              trailingContent = {
                Icon(
                  imageVector = if (advancedExpanded) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore,
                  contentDescription = if (advancedExpanded) "Collapse" else "Expand",
                )
              },
              modifier =
                Modifier.clickable {
                  advancedExpanded = !advancedExpanded
                },
            )
          }
          item {
            AnimatedVisibility(visible = advancedExpanded) {
              Column(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                ListItem(
                  headlineContent = { Text("Use Manual Gateway") },
                  supportingContent = { Text("Use this when discovery is blocked.") },
                  trailingContent = { Switch(checked = manualEnabled, onCheckedChange = viewModel::setManualEnabled) },
                )

                OutlinedTextField(
                  value = manualHost,
                  onValueChange = viewModel::setManualHost,
                  label = { Text("Host") },
                  modifier = Modifier.fillMaxWidth(),
                  enabled = manualEnabled,
                )
                OutlinedTextField(
                  value = manualPort.toString(),
                  onValueChange = { v -> viewModel.setManualPort(v.toIntOrNull() ?: 0) },
                  label = { Text("Port") },
                  modifier = Modifier.fillMaxWidth(),
                  enabled = manualEnabled,
                )
                OutlinedTextField(
                  value = gatewayToken,
                  onValueChange = viewModel::setGatewayToken,
                  label = { Text("Gateway Token") },
                  modifier = Modifier.fillMaxWidth(),
                  enabled = manualEnabled,
                  singleLine = true,
                )
                ListItem(
                  headlineContent = { Text("Require TLS") },
                  supportingContent = { Text("Pin the gateway certificate on first connect.") },
                  trailingContent = {
                    Switch(
                      checked = manualTls,
                      onCheckedChange = viewModel::setManualTls,
                      enabled = manualEnabled,
                    )
                  },
                  modifier = Modifier.alpha(if (manualEnabled) 1f else 0.5f),
                )

                val hostOk = manualHost.trim().isNotEmpty()
                val portOk = manualPort in 1..65535
                Button(
                  onClick = {
                    NodeForegroundService.start(context)
                    viewModel.connectManual()
                  },
                  enabled = manualEnabled && hostOk && portOk,
                ) {
                  Text("Connect (Manual)")
                }
              }
            }
          }
        }
      }
    }
  }
}
